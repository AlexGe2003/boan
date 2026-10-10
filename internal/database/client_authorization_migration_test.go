package database

import (
	"path/filepath"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestClientAuthorizationMigrationPreservesExistingBindings(t *testing.T) {
	if err := InitDB(filepath.Join(t.TempDir(), "x-ui.db")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = CloseDB() })
	if IsPostgres() {
		t.Skip("SQLite upgrade fixture")
	}
	client := model.ClientRecord{Email: "existing", SubID: "existing-sub", Enable: true, LimitHwid: 3}
	if err := db.Create(&client).Error; err != nil {
		t.Fatal(err)
	}
	binding := model.ClientHwid{SubID: client.SubID, HwidHash: "existing-hash", DeviceModel: "existing device"}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{"ALTER TABLE clients DROP COLUMN subscription_authorization_required", "ALTER TABLE client_hwids DROP COLUMN authorization"} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := migrateClientAuthorizationColumn(); err != nil {
			t.Fatal(err)
		}
	}
	var got model.ClientHwid
	if err := db.First(&got, binding.Id).Error; err != nil || got.Authorization || got.HwidHash != binding.HwidHash {
		t.Fatal(got, err)
	}
	var restored model.ClientRecord
	if err := db.First(&restored, client.Id).Error; err != nil || restored.SubscriptionAuthorizationRequired || restored.LimitHwid != 3 {
		t.Fatal(restored, err)
	}
}
