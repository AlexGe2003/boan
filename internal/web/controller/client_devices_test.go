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

func TestClientDevicesAdminOnly(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	client := model.ClientRecord{Email: "device-client", Enable: true}
	if err := db.Create(&client).Error; err != nil {
		t.Fatal(err)
	}
	customer := model.User{Username: "device-customer", Password: admin.Password, Role: model.RoleCustomer, ClientID: &client.Id}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"devices", "connections"} {
		for _, tc := range []struct {
			id, status int
			email      string
		}{
			{admin.Id, http.StatusOK, client.Email}, {customer.Id, http.StatusForbidden, client.Email}, {admin.Id, http.StatusNotFound, "missing"},
		} {
			r, err := roleClient(t, engine, tc.id).do(http.MethodGet, "/panel/api/clients/"+path+"/"+tc.email, "")
			if err != nil {
				t.Fatal(err)
			}
			r.Body.Close()
			if r.StatusCode != tc.status {
				t.Fatalf("%s user %d status %d want %d", path, tc.id, r.StatusCode, tc.status)
			}
		}
	}
}

func TestClientConnectionNodeSyncDoesNotExposeDeviceRegistrations(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	if err := database.GetDB().Create(&model.ClientRecord{Email: "device-client", Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	for _, scope := range []string{model.ApiScopeNodeSync, model.ApiScopeMonitor} {
		token, err := (&panel.ApiTokenService{}).Create("devices-"+scope, scope, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{"devices", "connections"} {
			req := httptest.NewRequest(http.MethodGet, "/panel/api/clients/"+path+"/device-client", nil)
			req.Header.Set("Authorization", "Bearer "+token.Token)
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)
			if scope != model.ApiScopeNodeSync || path != "connections" {
				if rec.Code != http.StatusForbidden {
					t.Fatalf("%s %s: %d", scope, path, rec.Code)
				}
				continue
			}
			if rec.Code != http.StatusOK {
				t.Fatal(rec.Code, rec.Body.String())
			}
			var out struct {
				Success bool                       `json:"success"`
				Obj     map[string]json.RawMessage `json:"obj"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
				t.Fatal(err)
			}
			if !out.Success || out.Obj["devices"] != nil || string(out.Obj["sources"]) != "[]" {
				t.Fatal("node-sync must receive only local connection sources", rec.Body.String())
			}
		}
	}
}
