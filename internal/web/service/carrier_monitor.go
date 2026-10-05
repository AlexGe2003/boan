package service

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"time"
)

const carrierWindow = 5 * time.Minute

// These fixed public targets measure outbound ICMP reachability, not subscriber paths.
var carrierTargets = []struct{ name, address string }{
	{"电信", "202.96.128.86"},
	{"移动", "211.136.192.6"},
	{"联通", "210.21.196.6"},
}

type CarrierProbe struct {
	Name        string   `json:"name"`
	Target      string   `json:"target"`
	LatencyMs   *float64 `json:"latencyMs,omitempty"`
	LossPct     *float64 `json:"lossPct,omitempty"`
	Samples     int      `json:"samples"`
	LastChecked int64    `json:"lastChecked"`
	State       string   `json:"state"`
}

type carrierSample struct {
	at      time.Time
	latency *float64
}
type carrierHistory struct {
	samples []carrierSample
	checked time.Time
	state   string
}
type CarrierMonitor struct {
	mu      sync.RWMutex
	running sync.Mutex
	history [3]carrierHistory
}

var LocalCarrierMonitor CarrierMonitor
var pingTime = regexp.MustCompile(`time[=<]([0-9]+(?:\.[0-9]+)?)\s*ms`)

func parseCarrierPing(output []byte, err error) (*float64, string) {
	if err == nil {
		match := pingTime.FindSubmatch(output)
		if len(match) != 2 {
			return nil, "error"
		}
		value, parseErr := strconv.ParseFloat(string(match[1]), 64)
		if parseErr != nil {
			return nil, "error"
		}
		return &value, "ok"
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 1 {
		return nil, "timeout"
	}
	return nil, "error"
}

func (m *CarrierMonitor) record(index int, now time.Time, latency *float64, state string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	h := &m.history[index]
	h.checked, h.state = now, state
	kept := h.samples[:0]
	for _, sample := range h.samples {
		if sample.at.After(now.Add(-carrierWindow)) {
			kept = append(kept, sample)
		}
	}
	h.samples = kept
	// Permission or executable errors are not lost network packets.
	if state == "ok" || state == "timeout" {
		h.samples = append(h.samples, carrierSample{now, latency})
	}
}

// Sample runs in the panel cron, independently of how many dashboards are open.
func (m *CarrierMonitor) Sample() {
	if !m.running.TryLock() {
		return
	}
	defer m.running.Unlock()
	var wg sync.WaitGroup
	for i, target := range carrierTargets {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if runtime.GOOS != "linux" {
				m.record(i, time.Now(), nil, "unsupported")
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "ping", "-n", "-c", "1", "-W", "2", target.address)
			cmd.Env = append(os.Environ(), "LC_ALL=C")
			output, err := cmd.CombinedOutput()
			latency, state := parseCarrierPing(output, err)
			m.record(i, time.Now(), latency, state)
		}()
	}
	wg.Wait()
}

func (m *CarrierMonitor) Snapshot(now time.Time) []CarrierProbe {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]CarrierProbe, 0, len(carrierTargets))
	for i, target := range carrierTargets {
		h := m.history[i]
		p := CarrierProbe{Name: target.name, Target: target.address, State: h.state}
		if h.checked.IsZero() {
			p.State = "pending"
		} else {
			p.LastChecked = h.checked.UnixMilli()
			if now.Sub(h.checked) > 15*time.Second {
				p.State = "stale"
			}
		}
		lost := 0
		for _, sample := range h.samples {
			if !sample.at.After(now.Add(-carrierWindow)) {
				continue
			}
			p.Samples++
			if sample.latency == nil {
				lost++
			}
		}
		if p.Samples > 0 {
			loss := float64(lost) * 100 / float64(p.Samples)
			p.LossPct = &loss
		}
		if p.State == "ok" && len(h.samples) > 0 {
			p.LatencyMs = h.samples[len(h.samples)-1].latency
		}
		result = append(result, p)
	}
	return result
}
