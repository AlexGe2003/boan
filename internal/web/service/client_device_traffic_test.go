package service

import (
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestClientDeviceTrafficUsesUserDeltasWithoutQuotaOrBillingDoubleCounting(t *testing.T) {
	db := initTrafficTestDB(t)
	for _, email := range []string{"alice", "bob"} {
		if err := db.Create(&model.ClientRecord{Email: email, Enable: true}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.Node{Id: 1, Name: "HK", Address: "hk"}).Error; err != nil {
		t.Fatal(err)
	}
	createNodeInbound(t, db, 1, "hk", 44001)
	svc := &InboundService{}
	syncNode(t, svc, 1, "hk", xray.ClientTraffic{Email: "alice", Up: 1000, Down: 2000, Enable: true})
	syncNode(t, svc, 1, "hk", xray.ClientTraffic{Email: "alice", Up: 1100, Down: 2300, Enable: true})
	syncNode(t, svc, 1, "hk", xray.ClientTraffic{Email: "alice", Up: 1100, Down: 2300, Enable: true})
	if _, _, err := svc.AddTraffic(nil, []*xray.ClientTraffic{{Email: "alice", Up: 10, Down: 30}}); err != nil {
		t.Fatal(err)
	}
	if err := recordServerUsage(db, 1, "bob", 9999, 9999); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientGlobalTraffic{MasterGuid: "master", Email: "alice", Up: 90000, Down: 90000}).Error; err != nil {
		t.Fatal(err)
	}
	if err := (&NodeService{}).SetUsageBilling(ServerUsageBillingRequest{NodeId: 1, Multiplier: 2}); err != nil {
		t.Fatal(err)
	}
	if err := (&NodeService{}).SetUsageControl(ServerUsageControlRequest{NodeId: 1, Email: "alice", Basis: "proxy", AdjustUsage: true, Used: 900}); err != nil {
		t.Fatal(err)
	}
	assertTraffic := func() {
		t.Helper()
		r, err := (&ClientService{}).DeviceTraffic("alice")
		if err != nil || !r.Recorded || r.Up != 110 || r.Down != 330 || r.Total != 440 || len(r.Nodes) != 2 {
			t.Fatalf("wrong observed user traffic: %+v, %v", r, err)
		}
		if r.Nodes[0].NodeID != 0 || r.Nodes[0].Total != 40 || r.Nodes[1].NodeName != "HK" || r.Nodes[1].Up != 100 || r.Nodes[1].Down != 300 || r.Nodes[1].Total != 400 {
			t.Fatalf("wrong directional node breakdown: %+v", r.Nodes)
		}
		if r.StartedAt <= 0 || r.UpdatedAt < r.StartedAt {
			t.Fatalf("missing collection timestamps: %+v", r)
		}
	}
	assertTraffic()
	if err := svc.ResetClientTrafficByEmail("alice"); err != nil {
		t.Fatal(err)
	}
	assertTraffic()
}

func TestClientDeviceTrafficMissingAndHistoricalNodes(t *testing.T) {
	initClientHwidTestDB(t)
	rec := seedHwidClient(t, 0)
	svc := &ClientService{}
	r, err := svc.DeviceTraffic(rec.Email)
	if err != nil || r.Recorded || r.Nodes == nil || len(r.Nodes) != 0 {
		t.Fatalf("missing data must be unknown: %+v, %v", r, err)
	}
	rows := []model.ServerClientUsage{
		{NodeId: 0, Email: rec.Email, Up: 0, Down: 0, StartedAt: 100, UpdatedAt: 200},
		{NodeId: 42, Email: rec.Email, Up: 3, Down: 7, StartedAt: 50, UpdatedAt: 300},
	}
	if err := database.GetDB().Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	r, err = svc.DeviceTraffic(rec.Email)
	if err != nil || !r.Recorded || r.Up != 3 || r.Down != 7 || r.Total != 10 || r.StartedAt != 50 || r.UpdatedAt != 300 || len(r.Nodes) != 2 || r.Nodes[1].NodeID != 42 {
		t.Fatalf("removed nodes must retain observed traffic: %+v, %v", r, err)
	}
	if err := database.GetDB().Model(&model.ServerClientUsage{}).Where("email = ?", rec.Email).Updates(map[string]any{"up": database.TrafficMax, "down": database.TrafficMax}).Error; err != nil {
		t.Fatal(err)
	}
	r, err = svc.DeviceTraffic(rec.Email)
	if err != nil || r.Up != database.TrafficMax || r.Down != database.TrafficMax || r.Total != database.TrafficMax {
		t.Fatalf("large counters must not wrap: %+v, %v", r, err)
	}
}
