package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestClientActivityExactIdentityAndWindow(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	line := func(when time.Time, host, email string) string {
		return fmt.Sprintf("%s from 192.0.2.1:123 accepted tcp:%s:443 [inbound >> proxy] email: %s\n", when.Format("2006/01/02 15:04:05"), host, email)
	}
	path := filepath.Join(t.TempDir(), "access.log")
	text := line(now.Add(-time.Minute), "www.youtube.com", "alice") + line(now.Add(-3*time.Minute), "api.github.com", "alice") + line(now.Add(-4*time.Minute), "www.youtube.com", "alice") + line(now.Add(-time.Minute), "private.example", "alice2") + line(now.Add(-25*time.Hour), "old.example", "alice") + line(now.Add(time.Minute), "future.example", "alice") + "malformed email: alice\n"
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	r, err := readClientActivity(path, "alice", 24, now)
	if err != nil {
		t.Fatal(err)
	}
	if r.Connections != 3 || len(r.Destinations) != 2 || len(r.Recent) != 1 || r.Destinations[0].Host != "www.youtube.com" || r.Destinations[0].Count != 2 {
		t.Fatalf("incorrect aggregate: %+v", r)
	}
	if r.Recent[0].Category != "视频影音" {
		t.Fatal(r.Recent)
	}
	if r.Demo || r.Sampled {
		t.Fatal("real log marked demo/sample")
	}
}

func TestActivityHostAndClassification(t *testing.T) {
	for input, want := range map[string]string{"udp:[2001:db8::1]:443": "2001:db8::1", "https://EXAMPLE.COM:443/private?token=secret": "example.com", "tcp:api.github.com:443": "api.github.com", "//google.com:443": "google.com", "tcp:bad<script>:443": ""} {
		if got := activityHost(input); got != want {
			t.Errorf("%q: got %q want %q", input, got, want)
		}
	}
	if activityCategory("youtube.com.attacker.example") != "其他 / 未分类" {
		t.Fatal("suffix spoofing classified as youtube")
	}
	if activityCategory("gemini.google.com") != "AI 服务" {
		t.Fatal("specific domain priority lost")
	}
}

func TestActivityBoundedTailAndDisabled(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	r, err := readClientActivity("none", "alice", 1, now)
	if err != nil || r.Status != "disabled" {
		t.Fatal(r, err)
	}
	path := filepath.Join(t.TempDir(), "access.log")
	text := strings.Repeat("x", 9<<20) + "\n" + fmt.Sprintf("%s accepted tcp:github.com:443 email: alice [boan-demo]\n", now.Format("2006/01/02 15:04:05"))
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	r, err = readClientActivity(path, "alice", 1, now)
	if err != nil || !r.Sampled || !r.Demo || r.Connections != 1 {
		t.Fatal(r, err)
	}
}

func TestActivityNetworkClassification(t *testing.T) {
	for host, want := range map[string]string{
		"1.1.1.1":                     "DNS / 解析服务",
		"2606:4700:4700::1111":        "DNS / 解析服务",
		"dns.google":                  "DNS / 解析服务",
		"192.168.1.1":                 "内网 / 本地网络",
		"127.0.0.1":                   "内网 / 本地网络",
		"fe80::1":                     "内网 / 本地网络",
		"203.0.113.5":                 "纯 IP / 域名不可见",
		"cdn.oaistatic.com":           "AI 服务",
		"api.bilibili.com":            "视频影音",
		"video.twimg.com":             "社交沟通",
		"dns.google.attacker.example": "其他 / 未分类",
	} {
		if got := activityCategory(host); got != want {
			t.Errorf("%s: got %s want %s", host, got, want)
		}
	}
	for _, host := range []string{"tcp:bad..example:443", "tcp:-bad.example:443", "tcp:bad-.example:443"} {
		if got := activityHost(host); got != "" {
			t.Errorf("invalid host accepted: %s", got)
		}
	}
}

func TestActivityScopeFiltersBeforeLimits(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	var log strings.Builder
	for i := 0; i < 120; i++ {
		fmt.Fprintf(&log, "%s accepted tcp:1.1.1.1:443 email: alice\n", now.Format("2006/01/02 15:04:05"))
	}
	fmt.Fprintf(&log, "%s accepted tcp:chatgpt.com:443 email: alice\n", now.Add(-time.Minute).Format("2006/01/02 15:04:05"))
	path := filepath.Join(t.TempDir(), "access.log")
	if err := os.WriteFile(path, []byte(log.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		scope, host string
		count       int
	}{
		{"web", "chatgpt.com", 1}, {"network", "1.1.1.1", 120}, {"all", "1.1.1.1", 121},
	} {
		r, err := readClientActivity(path, "alice", 24, now, tc.scope)
		if err != nil {
			t.Fatal(err)
		}
		if r.Connections != tc.count || r.Destinations[0].Host != tc.host || r.Visits[0].Host != tc.host || r.Recent[0].Host != tc.host {
			t.Fatalf("scope %s: %+v", tc.scope, r)
		}
		if tc.scope != "all" && (len(r.Categories) != 1 || r.Categories[0].Count != tc.count) {
			t.Fatalf("inconsistent scoped categories: %+v", r)
		}
	}
}

func TestActivityFleetMerge(t *testing.T) {
	now := time.Now()
	parts := []activityPart{
		{source: ActivitySource{NodeID: 0, Name: "local"}, data: ClientActivity{Status: "ready", Connections: 2, Destinations: []ActivityDestination{{Host: "example.com", Count: 2, LastSeen: 10}}, Categories: []ActivityCategory{{Name: "other", Count: 2}}, Visits: []ActivityVisit{{Host: "example.com", Time: 10}}}},
		{source: ActivitySource{NodeID: 1, Name: "remote"}, data: ClientActivity{Status: "ready", Connections: 3, Sampled: true, Destinations: []ActivityDestination{{Host: "example.com", Count: 3, LastSeen: 20}}, Categories: []ActivityCategory{{Name: "other", Count: 3}}, Visits: []ActivityVisit{{Host: "example.com", Time: 20}}}},
		{source: ActivitySource{NodeID: 2, Name: "offline"}, data: ClientActivity{Status: "unavailable"}},
	}
	got := mergeActivity(parts, 24, now)
	if got.Connections != 5 || len(got.Destinations) != 1 || got.Destinations[0].Count != 5 || got.Categories[0].Count != 5 {
		t.Fatalf("bad totals: %+v", got)
	}
	if len(got.Sources) != 3 || got.Sources[2].Status != "unavailable" || !got.Sampled {
		t.Fatalf("missing coverage: %+v", got)
	}
	if got.Visits[0].NodeName != "remote" || got.Visits[1].NodeName != "local" {
		t.Fatal(got.Visits)
	}
}
