package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestClientActivityAdminOnly(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	c := model.ClientRecord{Email: "activity-client", Enable: true}
	if err := db.Create(&c).Error; err != nil {
		t.Fatal(err)
	}
	u := model.User{Username: "activity-customer", Password: admin.Password, Role: model.RoleCustomer, ClientID: &c.Id}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id     int
		path   string
		status int
	}{{admin.Id, "activity-client", http.StatusOK}, {u.Id, "activity-client", http.StatusForbidden}, {admin.Id, "missing-client", http.StatusNotFound}} {
		r, err := roleClient(t, engine, tc.id).do(http.MethodGet, "/panel/api/clients/activity/"+tc.path, "")
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != tc.status {
			t.Fatalf("user %d status %d want %d", tc.id, r.StatusCode, tc.status)
		}
	}
}

func TestClientActivityNodeSyncLocalOnly(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	if err := database.GetDB().Create(&model.ClientRecord{Email: "activity-client", Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	for _, scope := range []string{model.ApiScopeNodeSync, model.ApiScopeMonitor} {
		token, err := (&panel.ApiTokenService{}).Create("activity-"+scope, scope, 0)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/panel/api/clients/activity/activity-client?nodeId=999", nil)
		req.Header.Set("Authorization", "Bearer "+token.Token)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if scope == model.ApiScopeMonitor {
			if rec.Code != http.StatusForbidden {
				t.Fatal(rec.Code)
			}
			continue
		}
		if rec.Code != http.StatusOK {
			t.Fatal(rec.Code, rec.Body.String())
		}
		var out struct {
			Success bool `json:"success"`
			Obj     struct {
				Sources []any `json:"sources"`
			} `json:"obj"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if !out.Success || len(out.Obj.Sources) != 0 {
			t.Fatal("node-sync request must remain local", rec.Body.String())
		}
	}
}
