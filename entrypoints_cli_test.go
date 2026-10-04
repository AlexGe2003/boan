package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/config"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func TestEntryCLIConfigurationRoundTrip(t *testing.T) {
	t.Setenv("XUI_DB_FOLDER", t.TempDir())
	if err := database.InitDB(config.GetDBPath()); err != nil {
		t.Fatal(err)
	}
	svc := &service.SettingService{}
	if err := svc.SetBasePath("/"); err != nil {
		t.Fatal(err)
	}
	ib := model.Inbound{Remark: "node one", Port: 443, Protocol: model.VLESS, Settings: `{"clients":[]}`}
	if err := database.GetDB().Create(&ib).Error; err != nil {
		t.Fatal(err)
	}
	database.CloseDB()
	run := func(args ...string) string {
		t.Helper()
		var out bytes.Buffer
		if err := entryPointsCLI(args, &out); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	run("-admin-url", "https://admin.example.com", "-user-url", "https://user.example.com")
	run("-subscription-url", "https://sub.example.com:2096")
	run("-user-enabled", "false")
	var snapshot struct {
		Entries         service.EntryPoints `json:"entries"`
		SubscriptionURL string              `json:"subscriptionURL"`
	}
	if err := json.Unmarshal([]byte(run("-show")), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Entries.UserEnabled || !strings.HasPrefix(snapshot.SubscriptionURL, "https://sub.example.com:2096/") {
		t.Fatalf("wrong snapshot: %+v", snapshot)
	}
	run("-reset")
	if err := json.Unmarshal([]byte(run("-show")), &snapshot); err != nil {
		t.Fatal(err)
	}
	if !snapshot.Entries.UserEnabled || snapshot.Entries.AdminURL != "" {
		t.Fatal("recovery failed")
	}
	var out bytes.Buffer
	if err := entryPointsCLI([]string{"-user-enabled", "false"}, &out); err == nil {
		t.Fatal("closed shared admin login")
	}
	if err := entryPointsCLI([]string{"-admin-url", "https://new.example.com", "-subscription-url", "https://sub.example.com"}, &out); err == nil {
		t.Fatal("accepted ambiguous multi-operation command")
	}
}

func TestEntryNodeAddressPreservesTransport(t *testing.T) {
	newTokenCLIEnv(t)
	ib := model.Inbound{Remark: "node one", Port: 443, Protocol: model.VLESS, Settings: `{"clients":[]}`}
	if err := database.GetDB().Create(&ib).Error; err != nil {
		t.Fatal(err)
	}
	if err := configureNodeAddress(ib.Id, "node.example.com"); err != nil {
		t.Fatal(err)
	}
	var host model.Host
	if err := database.GetDB().Where("inbound_id = ?", ib.Id).First(&host).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().Model(&host).Updates(map[string]any{"sni": "tls.example.com", "security": "tls", "port": 8443}).Error; err != nil {
		t.Fatal(err)
	}
	if err := configureNodeAddress(ib.Id, "new.example.com"); err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().First(&host, host.Id).Error; err != nil {
		t.Fatal(err)
	}
	if host.Address != "new.example.com" || host.Sni != "tls.example.com" || host.Port != 8443 || host.Security != "tls" {
		t.Fatalf("transport changed: %+v", host)
	}
	if err := configureNodeAddress(ib.Id, "https://wrong.example.com"); err == nil {
		t.Fatal("accepted a URL as a node hostname")
	}
}
