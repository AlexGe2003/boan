package service

import (
	"fmt"
	"math"
	"testing"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestServerUsageUsesCommittedDeltasAndSurvivesQuotaReset(t *testing.T) {
	db := initTrafficTestDB(t)
	svc := &InboundService{}
	for _, email := range []string{"alice", "bob"} {
		if err := db.Create(&model.ClientRecord{Email: email, Enable: true}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for id, tag := range map[int]string{1: "n1", 2: "n2"} {
		if err := db.Create(&model.Node{Id: id, Name: tag, Address: tag}).Error; err != nil {
			t.Fatal(err)
		}
		createNodeInbound(t, db, id, tag, 44000+id)
	}
	// Historical snapshots establish baselines; they are not attributed usage.
	syncNode(t, svc, 1, "n1", xray.ClientTraffic{Email: "alice", Up: 1000, Down: 2000, Enable: true})
	syncNode(t, svc, 2, "n2", xray.ClientTraffic{Email: "alice", Up: 2000, Down: 3000, Enable: true})
	syncNode(t, svc, 1, "n1", xray.ClientTraffic{Email: "bob", Up: 100, Down: 100, Enable: true}, xray.ClientTraffic{Email: "alice", Up: 1000, Down: 2000, Enable: true})
	syncNode(t, svc, 1, "n1", xray.ClientTraffic{Email: "bob", Up: 130, Down: 170, Enable: true}, xray.ClientTraffic{Email: "alice", Up: 1100, Down: 2200, Enable: true})
	syncNode(t, svc, 2, "n2", xray.ClientTraffic{Email: "alice", Up: 2100, Down: 3100, Enable: true})
	// Replayed snapshots must not accrue twice.
	syncNode(t, svc, 2, "n2", xray.ClientTraffic{Email: "alice", Up: 2100, Down: 3100, Enable: true})
	if _, _, err := svc.AddTraffic(nil, []*xray.ClientTraffic{{Email: "alice", Up: 25, Down: 75}}); err != nil {
		t.Fatal(err)
	}
	report, err := (&NodeService{}).Usage("alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Total != 600 {
		t.Fatalf("user total=%d want 600", report.Total)
	}
	expected := map[int]int64{0: 100, 1: 300, 2: 200}
	for _, row := range report.Servers {
		if row.Used != expected[row.NodeId] {
			t.Fatalf("node %d got %d want %d", row.NodeId, row.Used, expected[row.NodeId])
		}
	}
	nodeID := 1
	ranking, err := (&NodeService{}).Usage("", &nodeID)
	if err != nil {
		t.Fatal(err)
	}
	if ranking.Total != 400 || len(ranking.Users) != 2 || ranking.Users[0].Email != "alice" || ranking.Users[0].Share != 75 {
		t.Fatalf("wrong ranking: %+v", ranking)
	}
	if err := svc.ResetClientTrafficByEmail("alice"); err != nil {
		t.Fatal(err)
	}
	after, err := (&NodeService{}).Usage("alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if after.Total != 600 {
		t.Fatalf("quota reset erased analytics: %d", after.Total)
	}
	if err := db.Transaction(func(tx *gorm.DB) error { return svc.DelClientStat(tx, "alice") }); err != nil {
		t.Fatal(err)
	}
	after, err = (&NodeService{}).Usage("alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if after.Total != 0 {
		t.Fatalf("deleted user retains attribution: %d", after.Total)
	}
}

func TestServerUsageDeduplicatesSiblingInboundsAndRankingDenominator(t *testing.T) {
	db := initTrafficTestDB(t)
	svc := &InboundService{}
	if err := db.Create(&model.Node{Id: 1, Name: "n1", Address: "n1"}).Error; err != nil {
		t.Fatal(err)
	}
	createNodeInbound(t, db, 1, "n1", 44001)
	createNodeInbound(t, db, 1, "sibling", 44002)
	if err := db.Create(&model.ClientRecord{Email: "alice", Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	syncNode(t, svc, 1, "n1", xray.ClientTraffic{Email: "alice", Up: 100, Down: 100, Enable: true})
	snap := &runtime.TrafficSnapshot{Inbounds: []*model.Inbound{
		{Tag: "n1", ClientStats: []xray.ClientTraffic{{Email: "alice", Up: 150, Down: 150, Enable: true}}},
		{Tag: "sibling", ClientStats: []xray.ClientTraffic{{Email: "alice", Up: 140, Down: 140, Enable: true}}},
	}}
	if _, err := svc.setRemoteTrafficLocked(1, snap, false, false); err != nil {
		t.Fatal(err)
	}
	nodeID := 1
	report, err := (&NodeService{}).Usage("", &nodeID)
	if err != nil {
		t.Fatal(err)
	}
	if report.Total != 100 {
		t.Fatalf("sibling usage=%d want 100", report.Total)
	}
	for i := 0; i < 101; i++ {
		email := fmt.Sprintf("user-%03d", i)
		if err := db.Create(&model.ClientRecord{Email: email, Enable: true}).Error; err != nil {
			t.Fatal(err)
		}
		if err := recordServerUsage(db, 1, email, 100, 0); err != nil {
			t.Fatal(err)
		}
	}
	report, err = (&NodeService{}).Usage("", &nodeID)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Users) != 100 || report.UserCount != 102 || !report.Truncated || report.Total != 10200 {
		t.Fatalf("bounded ranking has wrong totals: %+v", report)
	}
	if math.Abs(report.Users[0].Share-100.0/102) > 0.00001 {
		t.Fatalf("share excludes omitted users: %f", report.Users[0].Share)
	}
}

func TestRelayBillingSeparatesServerCostsFromQuota(t *testing.T) {
	db := initTrafficTestDB(t)
	svc := &NodeService{}
	for _, email := range []string{"alice", "bob"} {
		if err := db.Create(&model.ClientRecord{Email: email, Enable: true}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for id := 1; id <= 2; id++ {
		if err := db.Create(&model.Node{Id: id, Name: fmt.Sprint(id), Address: fmt.Sprint(id)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	quota := xray.ClientTraffic{Email: "alice", Up: 10, Down: 100, Enable: true}
	if err := db.Create(&quota).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		node     int
		email    string
		up, down int64
	}{
		{1, "alice", 10, 100}, {1, "bob", 5, 45}, {2, "alice", 10, 30},
	} {
		if err := recordServerUsage(db, row.node, row.email, row.up, row.down); err != nil {
			t.Fatal(err)
		}
	}
	if err := svc.SetUsageBilling(ServerUsageBillingRequest{NodeId: 1, Multiplier: 2}); err != nil {
		t.Fatal(err)
	}
	report, err := svc.Usage("alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Total != 150 || report.BillableTotal != 260 {
		t.Fatalf("raw/billable: %+v", report)
	}
	all, err := svc.Usage("", nil)
	if err != nil || all.Total != 200 || all.BillableTotal != 360 {
		t.Fatalf("all servers must sum each individual multiplier: %+v %v", all, err)
	}
	var relay ServerUsageSummary
	for _, row := range report.Servers {
		if row.NodeId == 1 {
			relay = row
		}
	}
	if relay.Billable != 220 || math.Abs(relay.BillingShare-220.0/260*100) > 0.001 {
		t.Fatalf("relay: %+v", relay)
	}
	id := 1
	rank, err := svc.Usage("", &id)
	if err != nil {
		t.Fatal(err)
	}
	if rank.Total != 160 || rank.BillableTotal != 320 || rank.Users[0].Billable != 220 || rank.Users[0].Share != 68.75 {
		t.Fatalf("rank: %+v", rank)
	}
	var unchanged xray.ClientTraffic
	if err := db.Where("email = ?", "alice").First(&unchanged).Error; err != nil {
		t.Fatal(err)
	}
	if unchanged.Up != 10 || unchanged.Down != 100 {
		t.Fatalf("billing modified quota: %+v", unchanged)
	}
	if err := (&InboundService{}).ResetClientTrafficByEmail("alice"); err != nil {
		t.Fatal(err)
	}
	report, err = svc.Usage("alice", nil)
	if err != nil || report.BillableTotal != 260 {
		t.Fatalf("reset lost billing: %+v %v", report, err)
	}
	for _, invalid := range []ServerUsageBillingRequest{{NodeId: 1, Multiplier: 0}, {NodeId: 1, Multiplier: 3}, {NodeId: -1, Multiplier: 2}, {NodeId: 999, Multiplier: 2}} {
		if err := svc.SetUsageBilling(invalid); err == nil {
			t.Fatalf("accepted invalid billing: %+v", invalid)
		}
	}
	if err := svc.SetUsageBilling(ServerUsageBillingRequest{NodeId: 1, Multiplier: 1}); err != nil {
		t.Fatal(err)
	}
	report, err = svc.Usage("alice", nil)
	if err != nil || report.Total != 150 || report.BillableTotal != 150 {
		t.Fatalf("recalculation: %+v %v", report, err)
	}
}

func TestManualNodeAndUserUsageControlsPreserveCollectedDeltas(t *testing.T) {
	db := initTrafficTestDB(t)
	svc := &NodeService{}
	for _, email := range []string{"alice", "bob", "unused"} {
		if err := db.Create(&model.ClientRecord{Email: email, Enable: true}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for id := 1; id <= 2; id++ {
		if err := db.Create(&model.Node{Id: id, Name: fmt.Sprint(id), Address: fmt.Sprint(id)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&xray.ClientTraffic{Email: "alice", Up: 10, Down: 90, Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	for _, r := range []struct {
		node     int
		email    string
		up, down int64
	}{{1, "alice", 10, 90}, {1, "bob", 5, 45}, {2, "alice", 20, 180}} {
		if err := recordServerUsage(db, r.node, r.email, r.up, r.down); err != nil {
			t.Fatal(err)
		}
	}
	if err := svc.SetUsageBilling(ServerUsageBillingRequest{NodeId: 1, Multiplier: 2}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetUsageControl(ServerUsageControlRequest{NodeId: 1, Email: "alice", Quota: 120, Basis: "billing", AdjustUsage: true, Used: 60}); err != nil {
		t.Fatal(err)
	}
	r, err := svc.Usage("alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if r.Total != 260 || r.BillableTotal != 320 {
		t.Fatalf("single node correction leaked: %+v", r)
	}
	for _, row := range r.Servers {
		if row.NodeId == 1 && (row.Recorded != 100 || row.Adjustment != -40 || !row.Exceeded || row.Remaining != 0) {
			t.Fatalf("bad user budget: %+v", row)
		}
	}
	if err := svc.SetUsageControl(ServerUsageControlRequest{NodeId: 1, Quota: 500, Basis: "billing", AdjustUsage: true, Used: 300}); err != nil {
		t.Fatal(err)
	}
	id := 1
	rank, err := svc.Usage("", &id)
	if err != nil {
		t.Fatal(err)
	}
	if rank.Total != 300 || rank.BillableTotal != 600 || rank.Users[0].Used != 60 || rank.Users[0].Share != 20 {
		t.Fatalf("bad node total: %+v", rank)
	}
	for _, row := range rank.Servers {
		if row.NodeId == 1 && (row.Unattributed != 190 || row.Recorded != 150 || !row.Exceeded) {
			t.Fatalf("bad manual attribution: %+v", row)
		}
	}
	if err := svc.SetUsageControl(ServerUsageControlRequest{NodeId: 1, Basis: "proxy", AdjustUsage: true, Used: 100}); err == nil {
		t.Fatal("node total accepted below attributed users")
	}
	if err := recordServerUsage(db, 1, "alice", 2, 18); err != nil {
		t.Fatal(err)
	}
	rank, err = svc.Usage("", &id)
	if err != nil || rank.Total != 320 || rank.Users[0].Used != 80 || rank.Users[0].Recorded != 120 {
		t.Fatalf("new delta was lost: %+v %v", rank, err)
	}
	if err := (&InboundService{}).ResetClientTrafficByEmail("alice"); err != nil {
		t.Fatal(err)
	}
	r, err = svc.Usage("alice", nil)
	if err != nil || r.Total != 280 {
		t.Fatalf("subscription reset affected manual stats: %+v %v", r, err)
	}
	if err := svc.SetUsageControl(ServerUsageControlRequest{NodeId: 2, Email: "unused", Quota: 100, Basis: "proxy"}); err != nil {
		t.Fatal(err)
	}
	if err := recordServerUsage(db, 2, "unused", 3, 7); err != nil {
		t.Fatal(err)
	}
	r, err = svc.Usage("unused", nil)
	if err != nil || r.Total != 10 {
		t.Fatalf("preallocated user budget lost first delta: %+v %v", r, err)
	}
	var observed model.ServerClientUsage
	db.Where("node_id=1 AND email='alice'").First(&observed)
	if observed.Up != 12 || observed.Down != 108 {
		t.Fatalf("observed counters overwritten: %+v", observed)
	}
	if err := svc.SetUsageControl(ServerUsageControlRequest{NodeId: 1, Email: "alice", Basis: "proxy", Quota: 1000}); err != nil {
		t.Fatal(err)
	}
	r, err = svc.Usage("alice", nil)
	if err != nil || r.Total != 280 {
		t.Fatalf("editing quota reset correction: %+v %v", r, err)
	}
	for _, req := range []ServerUsageControlRequest{{NodeId: 1, Quota: -1, Basis: "proxy"}, {NodeId: 1, Used: -1, Basis: "proxy"}, {NodeId: -1, Basis: "proxy"}, {NodeId: 1, Basis: "unknown"}, {NodeId: 999, Basis: "proxy"}, {NodeId: 1, Email: "missing", Basis: "proxy"}} {
		if err := svc.SetUsageControl(req); err == nil {
			t.Fatalf("accepted invalid control: %+v", req)
		}
	}
	if err := db.Transaction(func(tx *gorm.DB) error { return (&InboundService{}).DelClientStat(tx, "alice") }); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.ServerUsageControl{}).Where("email='alice'").Count(&count)
	if count != 0 {
		t.Fatalf("deleted client kept manual controls: %d", count)
	}
}
