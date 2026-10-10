package middleware

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

func TestWebsiteVisitorIPTrustBoundary(t *testing.T) {
	for _, tc := range []struct {
		name, remote, forwarded, want string
	}{
		{"untrusted cannot spoof", "203.0.113.10:1234", "1.2.3.4", "203.0.113.10"},
		{"trusted proxy", "127.0.0.1:1234", "1.2.3.4", "1.2.3.4"},
		{"ignore spoofed leftmost", "127.0.0.1:1234", "9.9.9.9, 203.0.113.10", "203.0.113.10"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.RemoteAddr = tc.remote
			r.Header.Set("X-Forwarded-For", tc.forwarded)
			got, ok := websiteVisitorIP(r, "127.0.0.1/32")
			if !ok || got != netip.MustParseAddr(tc.want) {
				t.Fatalf("visitor IP = %v, %v; want %s", got, ok, tc.want)
			}
		})
	}
}

func TestWebsiteVisitorIPRejectsUnknownAndUnverifiableProxy(t *testing.T) {
	for _, tc := range []struct{ remote, xff string }{
		{"not-an-ip", ""}, {"127.0.0.1:443", ""}, {"127.0.0.1:443", "1.2.3.4, invalid"}, {"127.0.0.1:443", "127.0.0.1"},
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = tc.remote
		r.Header.Set("X-Forwarded-For", tc.xff)
		if _, ok := websiteVisitorIP(r, "127.0.0.1/32"); ok {
			t.Fatalf("accepted unverified visitor: %+v", tc)
		}
	}
}
