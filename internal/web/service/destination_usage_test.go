package service

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDestinationUsageExactUserAndStaleness(t *testing.T) {
	now := time.Now()
	path := filepath.Join(t.TempDir(), "usage.json")
	raw := fmt.Sprintf(`{"version":1,"since":1,"updatedAt":%d,"rows":[{"email":"alice","host":"example.com","up":12,"down":30},{"email":"alice2","host":"private.example","up":999,"down":999},{"email":"alice","host":"1.1.1.1","up":3,"down":4}]}`, now.UnixMilli())
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	u := readDestinationUsage(path, "alice", now)
	if u.Up != 15 || u.Down != 34 || len(u.Rows) != 2 || u.Status != "ready" {
		t.Fatalf("bad accounting: %+v", u)
	}
	if readDestinationUsage(path, "alice", now.Add(time.Minute)).Status != "stale" {
		t.Fatal("missing stale status")
	}
	if readDestinationUsage(path, "missing", now).Up != 0 {
		t.Fatal("cross-user leakage")
	}
}

func TestDestinationUsageMergeDoesNotScaleOrHideMissing(t *testing.T) {
	a := &DestinationUsage{Status: "ready", Up: 10, Down: 20, Rows: []DestinationUsageRow{{Host: "example.com", Up: 10, Down: 20}}}
	b := &DestinationUsage{Status: "stale", Up: 30, Down: 40, Rows: []DestinationUsageRow{{Host: "example.com", Up: 30, Down: 40}}}
	got := mergeDestinationUsage([]activityPart{{source: ActivitySource{Name: "A"}, data: ClientActivity{Usage: a}}, {source: ActivitySource{Name: "B"}, data: ClientActivity{Usage: b}}, {source: ActivitySource{Name: "C"}}})
	if got.Up != 40 || got.Down != 60 || len(got.Rows) != 1 || got.Rows[0].Up != 40 || !got.Partial {
		t.Fatalf("bad merged accounting: %+v", got)
	}
}
