package service

import (
	"errors"
	"testing"
	"time"

	probing "github.com/prometheus-community/pro-bing"
)

func TestCarrierProbeWindowAndNoInventedLoss(t *testing.T) {
	var monitor CarrierMonitor
	now := time.Now()
	ms := 15.2
	monitor.record(0, now.Add(-6*time.Minute), &ms, "ok")
	monitor.record(0, now.Add(-10*time.Second), &ms, "ok")
	monitor.record(0, now.Add(-5*time.Second), nil, "timeout")
	result := monitor.Snapshot(now)
	if len(result) != 3 || result[0].Samples != 2 || *result[0].LossPct != 50 || result[0].LatencyMs != nil {
		t.Fatalf("incorrect rolling window: %+v", result)
	}
	if result[1].State != "pending" || result[1].LossPct != nil {
		t.Fatal("an untested carrier must not show zero loss")
	}
	monitor.record(0, now, nil, "error")
	result = monitor.Snapshot(now)
	if result[0].Samples != 2 || *result[0].LossPct != 50 || result[0].State != "error" {
		t.Fatal("execution failures must not count as packet loss")
	}
	result = monitor.Snapshot(now.Add(6 * time.Minute))
	if result[0].State != "stale" || result[0].LossPct != nil || result[0].Samples != 0 {
		t.Fatal("expired samples must not remain live")
	}
	monitor.record(1, now, &ms, "ok")
	result = monitor.Snapshot(now)
	if result[1].LatencyMs == nil || *result[1].LatencyMs != ms || *result[1].LossPct != 0 {
		t.Fatal("successful carrier sample missing")
	}
}

func TestCarrierPingResult(t *testing.T) {
	for _, tc := range []struct {
		stats *probing.Statistics
		err   error
		state string
	}{
		{nil, nil, "error"},
		{&probing.Statistics{}, nil, "error"},
		{&probing.Statistics{PacketsSent: 1}, nil, "timeout"},
		{&probing.Statistics{PacketsSent: 1}, errors.New("socket failed"), "error"},
		{&probing.Statistics{PacketsSent: 1, PacketsRecv: 1, AvgRtt: 15 * time.Millisecond}, nil, "ok"},
	} {
		latency, state := carrierPingResult(tc.stats, tc.err)
		if state != tc.state {
			t.Fatalf("got %s, want %s", state, tc.state)
		}
		if state == "ok" && (latency == nil || *latency != 15) {
			t.Fatal("RTT missing")
		}
		if state != "ok" && latency != nil {
			t.Fatal("failed probe must not report zero RTT")
		}
	}
}

func TestCarrierRTTWindowExcludesLossAndExpiredSamples(t *testing.T) {
	var monitor CarrierMonitor
	now := time.Now()
	old, low, high := 1000.0, 10.0, 30.0
	monitor.record(0, now.Add(-6*time.Minute), &old, "ok")
	monitor.record(0, now.Add(-10*time.Second), &low, "ok")
	monitor.record(0, now.Add(-5*time.Second), nil, "timeout")
	monitor.record(0, now, &high, "ok")
	p := monitor.Snapshot(now)[0]
	if p.Samples != 3 || *p.AvgLatencyMs != 20 || *p.JitterMs != 10 {
		t.Fatalf("incorrect RTT summary: %+v", p)
	}
	expired := monitor.Snapshot(now.Add(6 * time.Minute))[0]
	if expired.AvgLatencyMs != nil || expired.JitterMs != nil {
		t.Fatal("expired RTT values remain visible")
	}
}
