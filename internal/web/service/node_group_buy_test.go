package service

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestNodeGroupBuyCostPersistenceAndExpiry(t *testing.T) {
	db := initTrafficTestDB(t)
	node := model.Node{Id: 1, Name: "HK", Address: "original.invalid", Enable: true}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	svc := &NodeService{}
	config := model.NodeGroupBuyConfig{NodeId: 1, GroupName: " 拼团 ", MonthlyPrice: 10001, FeeMode: "percent", FeeValue: 1000, MemberCount: 3, BandwidthMbps: 1000, BandwidthMode: "shared", MonthlyTraffic: 100000, ExpiresAt: time.Now().Add(5 * 24 * time.Hour).UnixMilli()}
	if err := svc.SetGroupBuy(config); err != nil {
		t.Fatal(err)
	}
	local := model.NodeGroupBuyConfig{NodeId: 0, MonthlyPrice: 5000, FeeMode: "fixed", FeeValue: 500, MemberCount: 2, BandwidthMode: "dedicated", ExpiresAt: time.Now().Add(-time.Hour).UnixMilli()}
	if err := svc.SetGroupBuy(local); err != nil {
		t.Fatal(err)
	}
	report, err := svc.GroupBuy()
	if err != nil {
		t.Fatal(err)
	}
	if report.MonthlyCost != 15001 || report.MonthlyFee != 1501 || report.MonthlyTotal != 16502 || report.DueSoon != 1 || report.Expired != 1 {
		t.Fatalf("incorrect report: %+v", report)
	}
	row := report.Nodes[1]
	if row.PerMember != 3668 || row.Config.GroupName != "拼团" || row.Config.BandwidthMbps != 1000 || row.Config.MonthlyTraffic != 100000 || row.ExpiryStatus != "soon" {
		t.Fatalf("incorrect saved row: %+v", row)
	}
	var unchanged model.Node
	db.First(&unchanged, 1)
	if !unchanged.Enable || unchanged.Address != "original.invalid" {
		t.Fatal("metadata modified node connection")
	}
	config.MonthlyPrice = 0
	config.FeeValue = 0
	config.MemberCount = 0
	config.ExpiresAt = 0
	config.MonthlyTraffic = 0
	config.BandwidthMbps = 0
	if err := svc.SetGroupBuy(config); err != nil {
		t.Fatal(err)
	}
	report, err = svc.GroupBuy()
	if err != nil {
		t.Fatal(err)
	}
	row = report.Nodes[1]
	if row.MonthlyTotal != 0 || row.PerMember != 0 || row.Config.ExpiresAt != 0 || row.Config.BandwidthMbps != 0 || row.Config.MonthlyTraffic != 0 || row.ExpiryStatus != "unset" {
		t.Fatalf("zero fields did not clear: %+v", row)
	}
}

func TestNodeGroupBuyRejectsInvalidAndMissingNode(t *testing.T) {
	initTrafficTestDB(t)
	svc := &NodeService{}
	valid := model.NodeGroupBuyConfig{NodeId: 0, FeeMode: "percent", FeeValue: 1000, BandwidthMode: "shared"}
	for _, change := range []func(*model.NodeGroupBuyConfig){
		func(c *model.NodeGroupBuyConfig) { c.MonthlyPrice = -1 },
		func(c *model.NodeGroupBuyConfig) { c.FeeValue = 10001 },
		func(c *model.NodeGroupBuyConfig) { c.MemberCount = -1 },
		func(c *model.NodeGroupBuyConfig) { c.FeeMode = "unknown" },
		func(c *model.NodeGroupBuyConfig) { c.MonthlyTraffic = -1 },
	} {
		c := valid
		change(&c)
		if err := svc.SetGroupBuy(c); err == nil {
			t.Fatalf("accepted invalid: %+v", c)
		}
	}
	valid.NodeId = 999
	if err := svc.SetGroupBuy(valid); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("missing node error: %v", err)
	}
	report, err := svc.GroupBuy()
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Nodes) != 1 || report.Nodes[0].Configured {
		t.Fatalf("invalid settings persisted: %+v", report)
	}
}
