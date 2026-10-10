package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestEntryLoginAndBearerCannotCrossDomains(t *testing.T) {
	engine := newRoleTestEngine(t)
	svc := &service.SettingService{}
	if err := svc.SetBasePath("/"); err != nil {
		t.Fatal(err)
	}
	p := service.EntryPoints{AdminURL: "https://admin.example.com", UserURL: "https://user.example.com", UserEnabled: true}
	if err := svc.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	password, err := crypto.HashPasswordAsBcrypt("entry-test-password")
	if err != nil {
		t.Fatal(err)
	}
	for _, role := range []string{model.RoleAdmin, model.RoleCustomer} {
		if err := database.GetDB().Create(&model.User{Username: "entry-" + role, Password: password, Role: role}).Error; err != nil {
			t.Fatal(err)
		}
	}
	ctl := &IndexController{}
	engine.POST("/entry-login", ctl.login)
	// Valid credentials must not create a session on the wrong entry host.
	for _, tc := range []struct{ host, role string }{{"admin.example.com", model.RoleCustomer}, {"user.example.com", model.RoleAdmin}} {
		req := httptest.NewRequest(http.MethodPost, "https://"+tc.host+"/entry-login", strings.NewReader(`{"username":"entry-`+tc.role+`","password":"entry-test-password"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden || len(w.Result().Cookies()) != 0 {
			t.Fatalf("wrong-domain login: %d %s", w.Code, w.Body.String())
		}
	}
	token, err := (&panel.ApiTokenService{}).Create("entry-test", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	// A token is authenticated after the global entry gate, so role enforcement
	// must check the host again before granting administrator API access.
	api := &APIController{}
	engine.GET("/entry-api", api.checkAPIAuth, api.enforceRole, func(c *gin.Context) { c.Status(204) })
	for _, tc := range []struct {
		host string
		want int
	}{{"admin.example.com", 204}, {"user.example.com", 403}} {
		req := httptest.NewRequest(http.MethodGet, "https://"+tc.host+"/entry-api", nil)
		req.Header.Set("Authorization", "Bearer "+token.Token)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != tc.want {
			t.Fatalf("token on %s: %d", tc.host, w.Code)
		}
	}
}
