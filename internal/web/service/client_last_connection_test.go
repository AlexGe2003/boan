package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestLastConnectionSurvivesOfflineAndAttributionPruning(t *testing.T) {
	initClientHwidTestDB(t)
	client := seedHwidClient(t, 0)
	guid, err := (&SettingService{}).GetPanelGuid()
	if err != nil {
		t.Fatal(err)
	}
	observed := time.Now().Unix() - 2
	svc := &InboundService{}
	if err := svc.RecordLocalClientIps(guid, map[string][]model.ClientIpEntry{
		client.Email: {{IP: "::ffff:192.0.2.42", Timestamp: observed}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecordLocalClientIps(guid, map[string][]model.ClientIpEntry{
		client.Email: {{IP: "198.51.100.8", Timestamp: observed - 30}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().Where("email = ?", client.Email).Delete(&model.NodeClientIp{}).Error; err != nil {
		t.Fatal(err)
	}
	report, err := (&ClientService{}).FleetClientConnections(context.Background(), client.Email)
	if err != nil {
		t.Fatal(err)
	}
	last := report.LastConnection
	if last == nil || last.NodeName != "本机" || last.IP != "192.0.*.42" || last.LastSeen != observed*1000 {
		t.Fatalf("lost last connection or replaced it with an older observation: %+v", last)
	}
	if len(report.Connections) != 0 || report.OnlineSourceCount != 0 {
		t.Fatalf("historical connection incorrectly counted as online: %+v", report)
	}
	raw, err := json.Marshal(report)
	if err != nil || strings.Contains(string(raw), "192.0.2.42") {
		t.Fatalf("unmasked history exposed: %s, %v", raw, err)
	}
}

func TestLastConnectionRejectsInvalidAndFutureSources(t *testing.T) {
	initClientHwidTestDB(t)
	client := seedHwidClient(t, 0)
	err := recordLastClientConnection(database.GetDB(), client.Email, ClientConnection{NodeName: "JP"}, []model.ClientIpEntry{
		{IP: "192.0.2.42", Timestamp: time.Now().Unix() + 3600},
		{IP: "127.0.0.1", Timestamp: time.Now().Unix()},
		{IP: "bad-ip", Timestamp: time.Now().Unix()},
	})
	if err != nil {
		t.Fatal(err)
	}
	var stored model.ClientRecord
	if err := database.GetDB().First(&stored, client.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.LastConnection != "" || stored.LastConnectionAt != 0 {
		t.Fatalf("invalid observation saved: %+v", stored)
	}
}
