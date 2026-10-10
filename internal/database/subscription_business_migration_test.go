package database

import (
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestSubscriptionBusinessUpgradePreservesLegacyPlan(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	legacy, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`CREATE TABLE subscription_plans (id integer PRIMARY KEY, name text, description text, inbound_ids text, total_gb integer, duration_days integer, limit_ip integer, limit_hwid integer, enabled numeric)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`INSERT INTO subscription_plans VALUES(17,'Legacy','preserve','[8,9]',1073741824,30,2,3,1)`).Error; err != nil {
		t.Fatal(err)
	}
	closeGorm(legacy)
	if err := InitDB(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = CloseDB() })
	var p model.SubscriptionPlan
	if err := GetDB().First(&p, 17).Error; err != nil {
		t.Fatal(err)
	}
	if p.InboundIDs != "[8,9]" || p.TotalGB != 1073741824 || p.DurationDays != 30 || p.NodeGroupIDs != "[]" || p.Prices != "[]" || !p.Enabled {
		t.Fatalf("legacy plan changed: %+v", p)
	}
	group := model.NodeGroup{Name: "Migrated", InboundIDs: "[8]"}
	if err := GetDB().Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	order := model.ServiceOrder{ID: "copy-order", UserID: 1, PlanID: 17, Amount: 990, Currency: "CNY", Status: "failed", Snapshot: `{"inboundIds":[8]}`, TargetExpiry: 1800000000000, PaymentNote: "receipt", LastError: "retry"}
	if err := GetDB().Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	dst, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "export.db")), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	defer closeGorm(dst)
	if err := copyAllModels(GetDB(), dst); err != nil {
		t.Fatal(err)
	}
	var restored model.ServiceOrder
	if err := dst.First(&restored, "id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if restored.Snapshot != order.Snapshot || restored.TargetExpiry != order.TargetExpiry || restored.PaymentNote != order.PaymentNote || restored.Status != "failed" {
		t.Fatalf("order lost on export: %+v", restored)
	}
	var restoredGroup model.NodeGroup
	if err := dst.First(&restoredGroup, group.ID).Error; err != nil {
		t.Fatal(err)
	}
	if restoredGroup.InboundIDs != group.InboundIDs {
		t.Fatal("node group members lost on export")
	}
}
