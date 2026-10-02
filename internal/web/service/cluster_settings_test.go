package service

import (
	"path/filepath"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/web/cluster"
)

func TestClusterSettingsAllowAccountSecurityButProtectConnections(t *testing.T) {
	if err := database.InitDB(filepath.Join(t.TempDir(), "settings.db")); err != nil {
		t.Fatal(err)
	}
	defer database.CloseDB()
	if err := cluster.Save(database.GetDB(), &cluster.State{ClusterID: "fleet", Self: "a", Primary: "a", Phase: "active"}); err != nil {
		t.Fatal(err)
	}
	svc := &SettingService{}
	current, err := svc.GetAllSetting()
	if err != nil {
		t.Fatal(err)
	}
	next := *current
	next.TwoFactorEnable = !current.TwoFactorEnable
	if err = svc.validateClusterSettings(&next); err != nil {
		t.Fatalf("account security should remain editable: %v", err)
	}
	next.WebBasePath = "/another-panel/"
	if err = svc.validateClusterSettings(&next); err == nil {
		t.Fatal("changed enrolled connection path")
	}
	next = *current
	next.TgBotEnable = true
	if err = svc.validateClusterSettings(&next); err == nil {
		t.Fatal("enabled an unfenced management channel")
	}
}
