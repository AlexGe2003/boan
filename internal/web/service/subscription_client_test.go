package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestIdentifySubscriptionClient(t *testing.T) {
	for _, tc := range []struct{ ua, name, version string }{
		{"Shadowrocket/2.2.92", "Shadowrocket", "2.2.92"},
		{"clash-verge/v2.4.3+autobuild", "Clash Verge", "2.4.3+autobuild"},
		{"Clash Verge/2.4.0", "Clash Verge", "2.4.0"},
		{"Clash-Verge-Rev/2.4.0", "Clash Verge", "2.4.0"},
		{"Clash Party/1.0", "Clash Party", "1.0"},
		{"Happ/1.0 (iOS)", "Happ", "1.0"},
		{"HiddifyNext/2.0", "Hiddify", "2.0"},
		{"v2rayNG/1.9.0", "v2rayNG", "1.9.0"},
		{"v2rayN/7.0", "v2rayN", "7.0"},
		{"mihomo/1.19.0", "Clash/Mihomo", "1.19.0"},
		{"Clash.Meta/1.0", "Clash/Mihomo", "1.0"},
		{"sing-box/1.12.0", "sing-box", "1.12.0"},
		{"Happ", "Happ", ""},
		{"Go-http-client/1.1", "", ""},
		{"Mozilla/5.0 Chrome/140.0.0", "", ""},
		{"NotShadowrocket/2.2", "", ""},
		{"", "", ""},
	} {
		name, version := IdentifySubscriptionClient(tc.ua)
		if name != tc.name || version != tc.version {
			t.Errorf("%q: %q %q, want %q %q", tc.ua, name, version, tc.name, tc.version)
		}
	}
}

func TestSubscriptionClientLatestAccountRecordWithoutDeviceSlots(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	db := database.GetDB()
	other := model.ClientRecord{Email: "other", SubID: "other-sub", Enable: true}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	svc := &ClientService{}
	for _, ua := range []string{"Happ/1.0", "Shadowrocket/2.2.92", "clash-verge/v2.4.3"} {
		if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: ua, SourceIP: "::ffff:192.0.2.42"}); err != nil {
			t.Fatal(err)
		}
	}
	slots, err := svc.DeviceSlots(rec.Email)
	if err != nil || slots.Registered != 0 || slots.SubscriptionClient == nil {
		t.Fatalf("slots %+v, %v", slots, err)
	}
	client := slots.SubscriptionClient
	if client.Name != "Clash Verge" || client.Version != "2.4.3" || client.LastIP != "192.0.*.42" {
		t.Fatalf("latest client %+v", client)
	}
	var count int64
	if err := db.Model(&model.ClientSubscriptionFetch{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("latest metadata must remain one row, count=%d, %v", count, err)
	}
	foreign, err := svc.DeviceSlots(other.Email)
	if err != nil || foreign.SubscriptionClient != nil {
		t.Fatal("another account's client leaked", err)
	}
	if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: strings.Repeat("x", 600), SourceIP: "invalid"}); err != nil {
		t.Fatal(err)
	}
	slots, err = svc.DeviceSlots(rec.Email)
	if err != nil || slots.SubscriptionClient.Name != "" || slots.SubscriptionClient.LastIP != "" || len(slots.SubscriptionClient.UserAgent) != 512 {
		t.Fatalf("unknown requester inherited old metadata: %+v, %v", slots, err)
	}
	raw, _ := json.Marshal(slots)
	if strings.Contains(string(raw), rec.SubID) || strings.Contains(string(raw), "192.0.2.42") {
		t.Fatal("report leaked a token or full IP")
	}
}

func TestSubscriptionClientMetadataDeletedWithAccount(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	svc := &ClientService{}
	if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: "Happ/1.0"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Delete(&InboundService{}, rec.Id, false); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := database.GetDB().Model(&model.ClientSubscriptionFetch{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("metadata retained after delete: %d, %v", count, err)
	}
}

func TestSubscriptionClientLocalRequestsDoNotOverwriteClient(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	svc := &ClientService{}
	for _, source := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0", "::"} {
		if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: "Shadowrocket/2.2", SourceIP: source}); err != nil {
			t.Fatal(err)
		}
	}
	var count int64
	if err := database.GetDB().Model(&model.ClientSubscriptionFetch{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("local requests recorded: %d, %v", count, err)
	}
	if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: "v2rayNG/1.10", SourceIP: "192.0.2.42"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecordSubscriptionClient(rec.SubID, HwidRequest{UserAgent: "Shadowrocket/2.2", SourceIP: "127.0.0.1"}); err != nil {
		t.Fatal(err)
	}
	slots, err := svc.DeviceSlots(rec.Email)
	if err != nil || slots.SubscriptionClient.Name != "v2rayNG" {
		t.Fatalf("local request overwrote client: %+v, %v", slots.SubscriptionClient, err)
	}
	if err := database.GetDB().Model(&model.ClientSubscriptionFetch{}).Where("client_id = ?", rec.Id).Update("last_ip", "127.0.0.1").Error; err != nil {
		t.Fatal(err)
	}
	slots, err = svc.DeviceSlots(rec.Email)
	if err != nil || slots.SubscriptionClient != nil {
		t.Fatalf("old local test metadata exposed: %+v, %v", slots.SubscriptionClient, err)
	}
}
