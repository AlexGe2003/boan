package middleware

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func TestEntryGateLiveSwitchAndRoles(t *testing.T) {
	if err := database.InitDB(filepath.Join(t.TempDir(), "x-ui.db")); err != nil {
		t.Fatal(err)
	}
	defer database.CloseDB()
	svc := &service.SettingService{}
	if err := svc.SetBasePath("/"); err != nil {
		t.Fatal(err)
	}
	p := service.EntryPoints{AdminURL: "https://admin.example.com", UserURL: "https://user.example.com", UserEnabled: true}
	if err := svc.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	engine := gin.New()
	engine.Use(sessions.Sessions("test", cookie.NewStore([]byte("test-entry-secret"))))
	// Simulate already-authenticated sessions, including a cookie replayed to the other host.
	engine.Use(func(c *gin.Context) {
		if role := c.GetHeader("Test-Role"); role != "" {
			session.SetAPIAuthUser(c, &model.User{Role: role})
		}
	})
	engine.Use(EntryPointGate())
	engine.Any("/*path", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	run := func(host, role, path, forwarded string, want int) {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "https://"+host+path, nil)
		req.Header.Set("Test-Role", role)
		req.Header.Set("X-Forwarded-Host", forwarded)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s %s %s: got %d want %d", host, role, path, w.Code, want)
		}
	}
	run("admin.example.com", model.RoleAdmin, "/panel/", "", 204)
	run("user.example.com", model.RoleCustomer, "/panel/", "", 204)
	run("admin.example.com", model.RoleCustomer, "/panel/", "", 403)
	run("user.example.com", model.RoleAdmin, "/panel/", "", 403)
	run("unknown.example.com", "", "/login", "admin.example.com", 404)
	p.UserEnabled = false
	if err := svc.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/login", "/panel/", "/panel/api/clients/mySubscriptions", "/assets/app.js", "/ws"} {
		run("user.example.com", model.RoleCustomer, path, "", 404)
	}
	run("admin.example.com", model.RoleAdmin, "/panel/", "", 204)
	run("admin.example.com", "", "/login", "", 204)
	p.UserEnabled = true
	if err := svc.SaveEntryPoints(p); err != nil {
		t.Fatal(err)
	}
	run("user.example.com", model.RoleCustomer, "/panel/", "", 204)
}
