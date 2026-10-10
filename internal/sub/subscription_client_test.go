package sub

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestSubscriptionClientRecordsSuccessfulBodyRoutesOnly(t *testing.T) {
	router, subID := initHwidSubRouter(t, 0)
	for _, route := range []string{"/sub/", "/json/", "/clash/", "/mihomo/"} {
		req := httptest.NewRequest(http.MethodGet, route+subID, nil)
		req.Header.Set("User-Agent", "clash-verge/v2.4.3")
		req.RemoteAddr = "192.0.2.42:1234"
		req.Header.Set("X-Forwarded-For", "203.0.113.99")
		req.Header.Set("X-Real-IP", "203.0.113.98")
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)
		if resp.Code != 200 {
			t.Fatalf("%s: %d", route, resp.Code)
		}
	}
	var before model.ClientSubscriptionFetch
	if err := database.GetDB().First(&before).Error; err != nil {
		t.Fatal(err)
	}
	if before.UserAgent != "clash-verge/v2.4.3" || before.LastIP != "192.0.2.42" {
		t.Fatalf("source spoofed: %+v", before)
	}
	for _, tc := range []struct{ method, path, accept string }{
		{http.MethodHead, "/sub/" + subID, ""},
		{http.MethodGet, "/sub/" + subID, "text/html"},
		{http.MethodGet, "/sub/" + subID + "?format=info", ""},
		{http.MethodGet, "/sub/" + subID + "/hwid-status", ""},
		{http.MethodGet, "/sub/unknown", ""},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		req.Header.Set("User-Agent", "Shadowrocket/2.2.92")
		req.Header.Set("Accept", tc.accept)
		router.ServeHTTP(httptest.NewRecorder(), req)
	}
	var after model.ClientSubscriptionFetch
	if err := database.GetDB().First(&after).Error; err != nil || after != before {
		t.Fatalf("metadata mutated by non-download: %+v, %v", after, err)
	}
	var devices int64
	database.GetDB().Model(&model.ClientHwid{}).Count(&devices)
	if devices != 0 {
		t.Fatal("ordinary clients must not create device slots")
	}
}

func TestSubscriptionClientRejectedHWIDDoesNotRecord(t *testing.T) {
	router, subID := initHwidSubRouter(t, 1)
	req := httptest.NewRequest(http.MethodGet, "/sub/"+subID, nil)
	req.Header.Set("User-Agent", "Shadowrocket/2.2.92")
	r := httptest.NewRecorder()
	router.ServeHTTP(r, req)
	var count int64
	if err := database.GetDB().Model(&model.ClientSubscriptionFetch{}).Count(&count).Error; err != nil || r.Code != 404 || count != 0 {
		t.Fatalf("denied request recorded, status=%d rows=%d err=%v", r.Code, count, err)
	}
}

func TestSubscriptionSourceIPTrustedProxyChain(t *testing.T) {
	router, subID := initHwidSubRouter(t, 0)
	for _, tc := range []struct{ real, forwarded, want string }{
		{"192.0.2.41", "203.0.113.99", "192.0.2.41"},
		{"", "203.0.113.99, 192.0.2.42, 127.0.0.1", "192.0.2.42"},
		{"", "invalid", "192.0.2.42"},
		{"::ffff:192.0.2.43", "", "192.0.2.43"},
	} {
		req := httptest.NewRequest(http.MethodGet, "/sub/"+subID, nil)
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set("X-Real-IP", tc.real)
		req.Header.Set("X-Forwarded-For", tc.forwarded)
		router.ServeHTTP(httptest.NewRecorder(), req)
		var row model.ClientSubscriptionFetch
		if err := database.GetDB().First(&row).Error; err != nil || row.LastIP != tc.want {
			t.Fatalf("got %q want %q, %v", row.LastIP, tc.want, err)
		}
	}
}
