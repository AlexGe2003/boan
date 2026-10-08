package service

import (
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestResetSubscriptionAtomic(t *testing.T) {
	setupBulkDB(t)
	db := database.GetDB()
	svc := &ClientService{}
	rec := model.ClientRecord{Email: "reset", SubID: "old-token", UUID: "keep-uuid", TotalGB: 123, ExpiryTime: 456}
	if err := db.Create(&rec).Error; err != nil {
		t.Fatal(err)
	}
	node := model.Node{Name: "reset-node", Address: "localhost", ApiToken: "test"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	inbound := model.Inbound{Tag: "reset", Port: 12345, Protocol: model.VLESS, NodeID: &node.Id, Settings: `{"clients":[{"email":"reset","subId":"old-token","id":"keep-uuid","custom":123}],"decryption":"none"}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: inbound.Id}).Error; err != nil {
		t.Fatal(err)
	}
	device := model.ClientHwid{SubID: rec.SubID, HwidHash: "device"}
	if err := db.Create(&device).Error; err != nil {
		t.Fatal(err)
	}
	token, err := svc.ResetSubscription(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.First(&inbound, inbound.Id).Error; err != nil {
		t.Fatal(err)
	}
	if strings.Contains(inbound.Settings, "old-token") || !strings.Contains(inbound.Settings, token) || !strings.Contains(inbound.Settings, `"custom":123`) {
		t.Fatal(inbound.Settings)
	}
	if err := db.First(&device, device.Id).Error; err != nil {
		t.Fatal(err)
	}
	if device.SubID != token {
		t.Fatal("device binding lost")
	}
	var dirty bool
	if err := db.Model(&model.Node{}).Where("id = ?", node.Id).Pluck("config_dirty", &dirty).Error; err != nil {
		t.Fatal(err)
	}
	if !dirty {
		t.Fatal("node not marked dirty")
	}
	if err := db.Model(&inbound).Update("settings", "invalid").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ResetSubscription(rec.Id); err == nil {
		t.Fatal("expected invalid settings error")
	}
	if err := db.First(&rec, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if rec.SubID != token {
		t.Fatal("failed reset changed token")
	}
	duplicate := model.ClientRecord{Email: "duplicate", SubID: token}
	if err := db.Create(&duplicate).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ResetSubscription(rec.Id); err == nil {
		t.Fatal("shared token should be rejected")
	}
}
