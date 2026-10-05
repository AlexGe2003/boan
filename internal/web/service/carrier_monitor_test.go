package service

import (
	"errors"
	"testing"
	"time"
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

func TestCarrierPingParsing(t *testing.T) {
	for _, output := range []string{"64 bytes from 1.2.3.4: icmp_seq=1 ttl=50 time=15.2 ms", "64 bytes from 1.2.3.4: time<1 ms"} {
		latency, state := parseCarrierPing([]byte(output), nil)
		if latency == nil || *latency <= 0 || state != "ok" {
			t.Fatalf("cannot parse %q", output)
		}
	}
	for _, err := range []error{nil, errors.New("permission denied")} {
		latency, state := parseCarrierPing([]byte("no measurement"), err)
		if latency != nil || state != "error" {
			t.Fatal("invalid output must not yield an invented measurement")
		}
	}
}
