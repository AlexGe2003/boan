package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/cluster"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestClusterRPCRejectsLimitedTokens(t *testing.T) {
	engine := newRoleTestEngine(t)
	api := &APIController{}
	group := engine.Group("/panel/api/cluster", api.checkAPIAuth, api.enforceTokenScope, api.enforceRole)
	registerCluster(group)
	for _, scope := range []string{model.ApiScopeMonitor, model.ApiScopeNodeSync, model.ApiScopeAdmin} {
		token, err := (&panel.ApiTokenService{}).Create(scope, scope, 0)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/panel/api/cluster/rpc", strings.NewReader(`{"action":"inspect"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token.Token)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		want := http.StatusForbidden
		if scope == model.ApiScopeAdmin {
			want = http.StatusOK
		}
		if rec.Code != want {
			t.Fatalf("scope %s status %d: %s", scope, rec.Code, rec.Body.String())
		}
	}
}

func TestFollowerMachineCredentialCannotMutateAccounts(t *testing.T) {
	engine := newRoleTestEngine(t)
	api := &APIController{}
	g := engine.Group("/panel/api/guarded", api.checkAPIAuth, api.enforceTokenScope, api.enforceRole, enforceClusterRole)
	g.POST("/account", func(c *gin.Context) { c.Status(204) })
	state := &cluster.State{Self: "b", Primary: "a", Phase: "active", Epoch: 1}
	if err := cluster.Save(database.GetDB(), state); err != nil {
		t.Fatal(err)
	}
	tok, err := (&panel.ApiTokenService{}).Create("test-admin", model.ApiScopeAdmin, 0)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/panel/api/guarded/account", nil)
	req.Header.Set("Authorization", "Bearer "+tok.Token)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("follower mutation status %d", rec.Code)
	}
}
