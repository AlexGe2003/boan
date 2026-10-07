package middleware

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	xraygeodata "github.com/xtls/xray-core/common/geodata"
	"google.golang.org/protobuf/proto"
)

func TestWebsiteGeoBlockLiveSwitchAndForwarding(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XUI_BIN_FOLDER", dir)
	if err := database.InitDB(filepath.Join(dir, "x-ui.db")); err != nil {
		t.Fatal(err)
	}
	defer database.CloseDB()
	list := &xraygeodata.GeoIPList{}
	for i, code := range []string{"CN", "HK", "MO", "TW"} {
		list.Entry = append(list.Entry, &xraygeodata.GeoIP{Code: code, Cidr: []*xraygeodata.CIDR{{Ip: []byte{byte(i + 1), 0, 0, 0}, Prefix: 8}}})
	}
	data, err := proto.Marshal(list)
	if err != nil {
		t.Fatal(err)
	}
	geoPath := filepath.Join(dir, "geoip.dat")
	if err = os.WriteFile(geoPath, data, 0600); err != nil {
		t.Fatal(err)
	}
	svc := &service.SettingService{}
	enabled := true
	trusted := "127.0.0.1/32"
	if err = svc.ConfigureWebsiteGeoBlock(&enabled, "CN,HK,MO,TW", &trusted); err != nil {
		t.Fatal(err)
	}

	token, err := (&panel.ApiTokenService{}).Create("status-test", model.ApiScopeMonitor, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path, token string
		want        int
	}{
		{"/panel/api/nodes/status-feed", token.Token, 0},
		{"/panel/api/nodes/status-feed", "invalid", 403},
		{"/panel/", token.Token, 403},
	} {
		r := httptest.NewRequest("GET", "http://panel.example.com"+tc.path, nil)
		r.RemoteAddr = "1.2.3.4:1234"
		r.Header.Set("Authorization", "Bearer "+tc.token)
		if got := WebsiteGeoStatus(r); got != tc.want {
			t.Fatalf("monitor geo %s: %d want %d", tc.path, got, tc.want)
		}
	}
	router := gin.New()
	router.Use(WebsiteGeoBlock())
	router.Any("/*path", func(c *gin.Context) { c.Status(204) })
	run := func(peer, xff, path string, want int) {
		t.Helper()
		r := httptest.NewRequest("GET", "http://user.example.com"+path, nil)
		r.RemoteAddr = peer
		r.Header.Set("X-Forwarded-For", xff)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s xff=%s %s: %d, want %d", peer, xff, path, w.Code, want)
		}
	}
	for _, ip := range []string{"1.2.3.4:123", "2.2.3.4:123", "3.2.3.4:123", "4.2.3.4:123"} {
		for _, path := range []string{"/login", "/panel/", "/panel/api/clients/mySubscriptions", "/assets/app.js", "/ws"} {
			run(ip, "9.1.2.3", path, 403)
		}
	}
	run("9.1.2.3:123", "1.2.3.4", "/login", 204)
	run("127.0.0.1:123", "1.2.3.4", "/login", 403)
	run("127.0.0.1:123", "9.1.2.3", "/login", 204)
	run("127.0.0.1:123", "", "/login", 403)
	if err = svc.ConfigureWebsiteGeoBlock(nil, "CN,MO,TW", nil); err != nil {
		t.Fatal(err)
	}
	run("127.0.0.1:123", "2.2.3.4", "/login", 204)
	for _, ip := range []string{"1.2.3.4", "3.2.3.4", "4.2.3.4"} {
		run("127.0.0.1:123", ip, "/login", 403)
	}
	all, err := svc.GetAllSetting()
	if err != nil {
		t.Fatal(err)
	}
	all.WebsiteGeoBlockRegions = "MO,TW"
	if err = svc.UpdateAllSetting(all, service.SecretClears{}); err != nil {
		t.Fatal(err)
	}
	run("127.0.0.1:123", "1.2.3.4", "/login", 204)
	run("127.0.0.1:123", "3.2.3.4", "/login", 403)
	all.WebsiteGeoBlockRegions = ""
	if err = svc.UpdateAllSetting(all, service.SecretClears{}); err != nil {
		t.Fatal(err)
	}
	if regions, err := svc.GetWebsiteGeoBlockRegions(); err != nil || regions != "MO,TW" {
		t.Fatalf("legacy save changed regions: %s %v", regions, err)
	}
	all.WebsiteGeoBlockRegions = "TYPO"
	if err = svc.UpdateAllSetting(all, service.SecretClears{}); err == nil {
		t.Fatal("accepted invalid region")
	}
	run("127.0.0.1:123", "1.2.3.4", "/login", 204)
	if err = os.Remove(geoPath); err != nil {
		t.Fatal(err)
	}
	run("9.1.2.3:123", "", "/login", 503)
	enabled = false
	if err = svc.ConfigureWebsiteGeoBlock(&enabled, "", nil); err != nil {
		t.Fatal(err)
	}
	run("1.2.3.4:123", "", "/login", 204)
	enabled = true
	if err = svc.ConfigureWebsiteGeoBlock(&enabled, "CN,HK,MO,TW", nil); err == nil {
		t.Fatal("enabled without GeoIP data")
	}
	if enabled, err := svc.GetWebsiteGeoBlockEnable(); err != nil || enabled {
		t.Fatalf("failed enable changed flag: %v %v", enabled, err)
	}
	trusted = "0.0.0.0/0"
	if err = svc.ConfigureWebsiteGeoBlock(nil, "", &trusted); err == nil {
		t.Fatal("trusted all internet")
	}
}
