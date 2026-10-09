package controller

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestSubscriberConflictFindsOriginalIdentity(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	client := roleClient(t, engine, admin.Id)
	db := database.GetDB()
	rec := model.ClientRecord{Email: "legacy-sub", SubID: "original-link", UUID: "original-node-id", TotalGB: 123456, Enable: true}
	if err := db.Create(&rec).Error; err != nil {
		t.Fatal(err)
	}
	check := func(name, kind, email string, exists bool) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"username": name, "password": "replacement-password", "accountOnly": true})
		r, err := client.do(http.MethodPost, "/panel/api/subscription-plans/subscribe", string(body))
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var result struct {
			Success bool
			Obj     subscriberConflict
		}
		if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if result.Success || result.Obj.Kind != kind || result.Obj.Email != email || result.Obj.AccountExists != exists {
			t.Fatalf("unexpected conflict: %+v", result)
		}
	}
	check("legacy-sub", "subscription_exists", "legacy-sub", false)
	u := model.User{Username: "different-login", Password: "original-hash", Role: model.RoleCustomer, ClientID: &rec.Id}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	check("legacy-sub", "account_exists", "legacy-sub", true)
	check("different-login", "account_exists", "legacy-sub", true)
	missingID := 999999
	orphan := model.User{Username: "orphan-login", Role: model.RoleCustomer, ClientID: &missingID}
	if err := db.Create(&orphan).Error; err != nil {
		t.Fatal(err)
	}
	check("orphan-login", "orphan_account", "", true)
	var after model.ClientRecord
	if err := db.First(&after, rec.Id).Error; err != nil || after.SubID != rec.SubID || after.UUID != rec.UUID || after.TotalGB != rec.TotalGB {
		t.Fatalf("original subscription changed: %+v %v", after, err)
	}
	if err := db.First(&u, u.Id).Error; err != nil || u.Password != "original-hash" {
		t.Fatal("duplicate creation changed original password")
	}
	var count int64
	db.Model(&model.ClientRecord{}).Count(&count)
	if count != 1 {
		t.Fatalf("failed creation left extra subscriptions: %d", count)
	}
}

func TestSubscriberDatabaseFailureIsNotReportedAsDuplicate(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	admin, _ := (&panel.UserService{}).GetFirstAdmin()
	client := roleClient(t, engine, admin.Id)
	db := database.GetDB()
	if err := db.Exec("CREATE TRIGGER reject_subscriber BEFORE INSERT ON clients BEGIN SELECT RAISE(FAIL, 'storage unavailable'); END").Error; err != nil {
		t.Fatal(err)
	}
	r, err := client.do(http.MethodPost, "/panel/api/subscription-plans/subscribe", `{"username":"new-user","password":"user","accountOnly":true}`)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var result struct {
		Success bool
		Msg     string
		Obj     *subscriberConflict
	}
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Success || result.Obj != nil || !strings.Contains(result.Msg, "storage unavailable") || strings.Contains(result.Msg, "已存在") {
		t.Fatalf("database failure misreported: %+v", result)
	}
}
