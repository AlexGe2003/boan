package controller

import (
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"testing"
)

func TestLegacyAccountMigrationPreservesSubscription(t *testing.T) {
	newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	service := panel.UserService{}
	admin, err := service.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	legacy := model.User{Username: "legacy-migration", Password: "unchanged-hash", Role: model.RoleUser, LoginEpoch: 3}
	client := model.ClientRecord{Email: "migration-sub", SubID: "keep-sub", TotalGB: 12345, ExpiryTime: 2000000000000, Enable: true}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&client).Error; err != nil {
		t.Fatal(err)
	}
	inbound := model.Inbound{UserId: legacy.Id, Tag: "migration-inbound", Port: 25456, Protocol: model.VLESS, Settings: `{"clients":[]}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := service.MigrateLegacyAccount(legacy.Id, client.Id, 0); err == nil {
		t.Fatal("ownership transfer must be explicit")
	}
	var unchanged model.User
	db.First(&unchanged, legacy.Id)
	if unchanged.Role != model.RoleUser || unchanged.ClientID != nil {
		t.Fatal("failed migration changed account")
	}
	if err := service.MigrateLegacyAccount(legacy.Id, client.Id, legacy.Id); err == nil {
		t.Fatal("non-admin owner accepted")
	}
	if err := service.MigrateLegacyAccount(admin.Id, client.Id, admin.Id); err == nil {
		t.Fatal("administrator migrated")
	}
	if err := service.MigrateLegacyAccount(legacy.Id, client.Id, admin.Id); err != nil {
		t.Fatal(err)
	}
	var migrated model.User
	db.First(&migrated, legacy.Id)
	if migrated.Role != model.RoleCustomer || migrated.ClientID == nil || *migrated.ClientID != client.Id || migrated.Password != legacy.Password || migrated.LoginEpoch != 4 {
		t.Fatalf("invalid migration: %+v", migrated)
	}
	db.First(&inbound, inbound.Id)
	if inbound.UserId != admin.Id {
		t.Fatal("ownership not transferred")
	}
	var after model.ClientRecord
	db.First(&after, client.Id)
	if after.SubID != client.SubID || after.TotalGB != client.TotalGB || after.ExpiryTime != client.ExpiryTime {
		t.Fatal("subscription changed")
	}
	second := model.User{Username: "legacy-second", Password: "hash", Role: model.RoleUser}
	db.Create(&second)
	if err := service.MigrateLegacyAccount(second.Id, client.Id, admin.Id); err == nil {
		t.Fatal("duplicate association accepted")
	}
}
