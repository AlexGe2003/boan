package sub

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func TestClosedUserWebsiteKeepsNodeSubscription(t *testing.T) {
	seedSubDB(t)
	svc := &service.SettingService{}
	if err := svc.SetBasePath("/"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SaveEntryPoints(service.EntryPoints{AdminURL: "https://admin.example.com", UserURL: "https://user.example.com", UserEnabled: false}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConfigureSubscriptionOrigin("https://sub.example.com", "", ""); err != nil {
		t.Fatal(err)
	}
	ib := seedSubInbound(t, "entry-sub", "entry-node", 8443, 0, wsTLSStream)
	seedHost(t, &model.Host{InboundId: ib.Id, Address: "node.example.com", Port: 8443})
	links, _, _, _, err := NewSubService("").GetSubs("entry-sub", "sub.example.com")
	if err != nil || len(links) != 1 || !strings.Contains(links[0], "node.example.com:8443") {
		t.Fatalf("closed website affected subscription: %v %v", links, err)
	}
}

func TestWebsiteRegionBlockDoesNotBlockSubscriptionHTTP(t *testing.T) {
	seedSubDB(t)
	svc := &service.SettingService{}
	seedSubInbound(t, "geo-sub", "geo-node", 8443, 0, wsTLSStream)
	// The subscription router must not consult the website-only switch.
	if err := database.GetDB().Create(&model.Setting{Key: "websiteGeoBlockEnable", Value: "true"}).Error; err != nil {
		t.Fatal(err)
	}
	server := NewServer()
	defer server.cancel()
	router, err := server.initRouter()
	if err != nil {
		t.Fatal(err)
	}
	path, err := svc.GetSubPath()
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://sub.example.com"+path+"geo-sub", nil)
	req.RemoteAddr = "1.2.3.4:54321"
	result := httptest.NewRecorder()
	router.ServeHTTP(result, req)
	if result.Code != 200 {
		t.Fatalf("subscription blocked by website policy: %d %s", result.Code, result.Body.String())
	}
}
