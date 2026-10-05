package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestStatusFeedTokenScopes(t *testing.T) {
	engine := newRoleTestEngine(t)
	for _, scope := range []string{model.ApiScopeMonitor, model.ApiScopeNodeSync, model.ApiScopeAdmin} {
		token, err := (&panel.ApiTokenService{}).Create("status-"+scope, scope, 0)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/panel/api/nodes/status-feed", nil)
		req.Header.Set("Authorization", "Bearer "+token.Token)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		want := http.StatusOK
		if scope == model.ApiScopeNodeSync {
			want = http.StatusForbidden
		}
		if rec.Code != want {
			t.Fatalf("scope %s: %d %s", scope, rec.Code, rec.Body.String())
		}
	}
	member, err := (&panel.UserService{}).CreatePanelUser("status-member", "test-password", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	res, err := roleClient(t, engine, member.Id).do(http.MethodGet, "/panel/api/nodes/status-feed", "")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("member status %d", res.StatusCode)
	}
}

func TestStatusFeedProjectionOmitsPrivateFields(t *testing.T) {
	projected := statusFeedProjection(monitoredNode{ID: 3, Address: "private-address", Name: "private-name", Inbounds: []monitoredInbound{{Remark: "private-inbound"}}})
	b, err := json.Marshal(projected)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err = json.Unmarshal(b, &fields); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"address", "name", "inbounds", "token", "clients"} {
		if _, ok := fields[key]; ok {
			t.Fatalf("private field %s", key)
		}
	}
}
