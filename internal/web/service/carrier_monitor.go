package service

import (
	"context"
	"math"
	"os"
	"runtime"
	"sync"
	"time"

	probing "github.com/prometheus-community/pro-bing"
)

const carrierWindow = 5 * time.Minute

// These fixed public targets measure outbound ICMP reachability, not subscriber paths.
var carrierTargets = []struct{ name, address string }{
	{"电信", "202.96.128.86"},
	{"移动", "211.136.192.6"},
	{"联通", "210.21.196.6"},
}

type CarrierProbe struct {
	AvgLatencyMs *float64 `json:"avgLatencyMs,omitempty"`
	JitterMs     *float64 `json:"jitterMs,omitempty"`
	Name         string   `json:"name"`
	Target       string   `json:"target"`
	LatencyMs    *float64 `json:"latencyMs,omitempty"`
	LossPct      *float64 `json:"lossPct,omitempty"`
	Samples      int      `json:"samples"`
	LastChecked  int64    `json:"lastChecked"`
	State        string   `json:"state"`
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

func carrierPingResult(stats *probing.Statistics, err error) (*float64, string) {
	if err != nil || stats == nil || stats.PacketsSent == 0 {
		return nil, "error"
	}
	if stats.PacketsRecv == 0 {
		return nil, "timeout"
	}
	latency := float64(stats.AvgRtt) / float64(time.Millisecond)
	return &latency, "ok"
}

func probeCarrier(ctx context.Context, address string) (*float64, string) {
	pinger, err := probing.NewPinger(address)
	if err != nil {
		return nil, "error"
	}
	pinger.SetNetwork("ip4")
	pinger.SetPrivileged(os.Geteuid() == 0)
	pinger.Count = 1
	pinger.Timeout = 2 * time.Second
	pinger.RecordRtts = false
	err = pinger.RunWithContext(ctx)
	return carrierPingResult(pinger.Statistics(), err)
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
			latency, state := probeCarrier(ctx, target.address)
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
		var rtts []float64
		for _, sample := range h.samples {
			if !sample.at.After(now.Add(-carrierWindow)) {
				continue
			}
			p.Samples++
			if sample.latency == nil {
				lost++
			} else {
				rtts = append(rtts, *sample.latency)
			}
		}
		if len(rtts) > 0 {
			sum := 0.0
			for _, rtt := range rtts {
				sum += rtt
			}
			mean := sum / float64(len(rtts))
			variance := 0.0
			for _, rtt := range rtts {
				variance += (rtt - mean) * (rtt - mean)
			}
			jitter := math.Sqrt(variance / float64(len(rtts)))
			p.AvgLatencyMs, p.JitterMs = &mean, &jitter
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
