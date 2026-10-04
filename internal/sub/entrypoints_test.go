package sub

import (
	"strings"
	"testing"

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
