package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func newRoleTestEngine(t *testing.T) *gin.Engine {
	return newRoleTestEngineWithUsers(t, false)
}

func newRoleTestEngineWithUsers(t *testing.T, realUsers bool) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	t.Setenv("XUI_DB_FOLDER", dir)
	if err := database.InitDB(filepath.Join(dir, "x-ui.db")); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { _ = database.CloseDB() })

	engine := gin.New()
	engine.Use(sessions.Sessions("3x-ui", cookie.NewStore([]byte("role-test-secret"))))
	apiCtl := &APIController{}
	engine.GET("/test-login/:id", func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		user := &model.User{}
		if err := database.GetDB().First(user, id).Error; err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		if err := session.SetLoginUser(c, user); err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		c.Status(http.StatusOK)
	})

	api := engine.Group("/panel/api")
	api.Use(apiCtl.checkAPIAuth)
	api.Use(apiCtl.enforceTokenScope)
	api.Use(apiCtl.enforceRole)
	if realUsers {
		NewSettingController(api)
	} else {
		api.POST("/setting/update", func(c *gin.Context) { c.Status(http.StatusNoContent) })
		api.POST("/setting/users", func(c *gin.Context) { c.Status(http.StatusCreated) })
		api.POST("/setting/users/name/:id", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	}
	api.GET("/server/getDb", func(c *gin.Context) { c.Status(http.StatusOK) })
	api.POST("/server/importDB", func(c *gin.Context) { c.Status(http.StatusOK) })
	NewInboundController(api.Group("/inbounds"))
	NewClientController(api.Group("/clients"))
	NewGroupController(api.Group("/clients"))
	NewSubscriptionPlanController(api.Group("/subscription-plans"))
	NewSupportController(api.Group("/support"))
	NewNodeGroupController(api.Group("/node-groups"))
	NewCommerceController(api.Group("/commerce"))
	NewNodeController(api.Group("/nodes"))
	return engine
}

func TestPanelUserAPIJSONRoundTrip(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	client := roleClient(t, engine, admin.Id)
	request := func(method, path, body string) struct {
		Success bool            `json:"success"`
		Msg     string          `json:"msg"`
		Obj     json.RawMessage `json:"obj"`
	} {
		t.Helper()
		resp, err := client.do(method, path, body)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s %s: status %d", method, path, resp.StatusCode)
		}
		var result struct {
			Success bool            `json:"success"`
			Msg     string          `json:"msg"`
			Obj     json.RawMessage `json:"obj"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if !result.Success {
			t.Fatalf("%s %s: %s", method, path, result.Msg)
		}
		return result
	}

	created := request(http.MethodPost, "/panel/api/setting/users", `{"username":"new-user","password":"secure-pass","role":"user"}`)
	var user panel.PanelUser
	if err := json.Unmarshal(created.Obj, &user); err != nil {
		t.Fatal(err)
	}
	if user.Id == 0 || user.Role != model.RoleUser {
		t.Fatalf("created user = %+v", user)
	}
	request(http.MethodGet, "/panel/api/setting/users", "")
	request(http.MethodPost, "/panel/api/setting/users/name/"+strconv.Itoa(user.Id), `{"username":"renamed-user"}`)
	var renamed model.User
	if err := database.GetDB().First(&renamed, user.Id).Error; err != nil || renamed.Username != "renamed-user" {
		t.Fatalf("renamed user = %+v, err = %v", renamed, err)
	}
	request(http.MethodPost, "/panel/api/setting/users/role/"+strconv.Itoa(user.Id), `{"role":"admin"}`)
	request(http.MethodPost, "/panel/api/setting/users/delete/"+strconv.Itoa(user.Id), `{}`)
	var removed model.User
	if err := database.GetDB().First(&removed, user.Id).Error; !database.IsNotFound(err) {
		t.Fatalf("deleted account still exists: %v", err)
	}
	selfDelete, err := client.do(http.MethodPost, "/panel/api/setting/users/delete/"+strconv.Itoa(admin.Id), `{}`)
	if err != nil {
		t.Fatal(err)
	}
	defer selfDelete.Body.Close()
	var selfResult struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(selfDelete.Body).Decode(&selfResult); err != nil {
		t.Fatal(err)
	}
	if selfResult.Success {
		t.Fatal("current admin deleted their own account")
	}
}

func TestCustomRolePagePermissionsApplyToAPI(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	adminClient := roleClient(t, engine, admin.Id)
	createRole, err := adminClient.do(http.MethodPost, "/panel/api/setting/roles", `{"name":"Clients only","pages":["/clients"]}`)
	if err != nil {
		t.Fatal(err)
	}
	var roleResult struct {
		Success bool                `json:"success"`
		Obj     panel.PanelRoleInfo `json:"obj"`
	}
	if err := json.NewDecoder(createRole.Body).Decode(&roleResult); err != nil {
		t.Fatal(err)
	}
	createRole.Body.Close()
	if !roleResult.Success || roleResult.Obj.Key == "" {
		t.Fatalf("role creation = %+v", roleResult)
	}
	user, err := users.CreatePanelUser("limited", "secure-pass", roleResult.Obj.Key)
	if err != nil {
		t.Fatal(err)
	}
	limited := roleClient(t, engine, user.Id)
	for _, tc := range []struct {
		path string
		want int
	}{
		{"/panel/api/clients/list", http.StatusOK},
		{"/panel/api/inbounds/list/slim", http.StatusOK},
		{"/panel/api/inbounds/list", http.StatusForbidden},
		{"/panel/api/clients/mySubscriptions", http.StatusForbidden},
		{"/panel/api/setting/roles", http.StatusForbidden},
	} {
		resp, err := limited.do(http.MethodGet, tc.path, "")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Errorf("GET %s = %d, want %d", tc.path, resp.StatusCode, tc.want)
		}
	}
	if err := users.UpdatePanelRole(roleResult.Obj.Key, "Inbounds only", []string{"/inbounds"}); err != nil {
		t.Fatal(err)
	}
	resp, err := limited.do(http.MethodGet, "/panel/api/clients/list", "")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("old permission remained after role update: %d", resp.StatusCode)
	}
	if err := users.DeletePanelRole(roleResult.Obj.Key); err == nil {
		t.Fatal("deleted assigned role")
	}
	if err := users.SetPanelUserRole(user.Id, model.RoleUser); err != nil {
		t.Fatal(err)
	}
	if err := users.DeletePanelRole(roleResult.Obj.Key); err != nil {
		t.Fatal(err)
	}
}

func TestUserRoleMonitoringIsReadOnlyAndScoped(t *testing.T) {
	engine := newRoleTestEngine(t)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	ops, err := users.CreatePanelUser("ops", "ops-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	db := database.GetDB()
	node := model.Node{Name: "node-one", Address: "node.example", Port: 2053, Enable: true, Status: "online", LatencyMs: 42, ApiToken: "private-api-token"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	for _, inbound := range []model.Inbound{
		{UserId: admin.Id, NodeID: &node.Id, Port: 443, Protocol: model.VLESS, Tag: "admin-secret", Settings: `{"clients":[{"id":"private-client-id"}]}`},
		{UserId: ops.Id, NodeID: &node.Id, Port: 8443, Protocol: model.VLESS, Tag: "owned", Remark: "My node", Total: 1000, Up: 100, Down: 200},
	} {
		if err := db.Create(&inbound).Error; err != nil {
			t.Fatal(err)
		}
	}
	client := roleClient(t, engine, ops.Id)
	resp, err := client.do(http.MethodGet, "/panel/api/nodes/monitor", "")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body := readBody(t, resp)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, "My node") || !strings.Contains(body, `"remaining":700`) {
		t.Fatalf("monitor response %d: %s", resp.StatusCode, body)
	}
	for _, secret := range []string{"admin-secret", "private-client-id", "private-api-token"} {
		if strings.Contains(body, secret) {
			t.Fatalf("monitor leaked %q: %s", secret, body)
		}
	}
	for _, path := range []string{"/panel/api/nodes/list", "/panel/api/clients/groups"} {
		denied, err := client.do(http.MethodGet, path, "")
		if err != nil {
			t.Fatal(err)
		}
		denied.Body.Close()
		if denied.StatusCode != http.StatusForbidden {
			t.Errorf("%s = %d, want 403", path, denied.StatusCode)
		}
	}
	denied, err := client.do(http.MethodPost, "/panel/api/clients/bulkDel", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	denied.Body.Close()
	if denied.StatusCode != http.StatusForbidden {
		t.Errorf("bulkDel = %d, want 403", denied.StatusCode)
	}
}

type roleSession struct {
	client *http.Client
	base   string
}

func (s roleSession) do(method, path, body string) (*http.Response, error) {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, s.base+path, reader)
	if err != nil {
		return nil, err
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return s.client.Do(req)
}

func roleClient(t *testing.T, engine http.Handler, userID int) roleSession {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar}
	srv := httptest.NewServer(engine)
	t.Cleanup(srv.Close)
	resp, err := client.Get(srv.URL + "/test-login/" + strconv.Itoa(userID))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d", resp.StatusCode)
	}
	return roleSession{client: client, base: srv.URL}
}

func TestUserRoleCannotChangePanelSettings(t *testing.T) {
	engine := newRoleTestEngine(t)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	if !admin.IsAdmin() {
		t.Fatal("seeded account is not admin")
	}
	ops, err := users.CreatePanelUser("ops", "ops-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}

	userClient := roleClient(t, engine, ops.Id)
	adminClient := roleClient(t, engine, admin.Id)

	for _, call := range []struct {
		client roleSession
		method string
		path   string
		want   int
	}{
		{userClient, http.MethodPost, "/panel/api/setting/update", http.StatusForbidden},
		{userClient, http.MethodPost, "/panel/api/setting/users", http.StatusForbidden},
		{userClient, http.MethodPost, "/panel/api/setting/users/name/1", http.StatusForbidden},
		{userClient, http.MethodGet, "/panel/api/server/getDb", http.StatusForbidden},
		{userClient, http.MethodPost, "/panel/api/server/importDB", http.StatusForbidden},
		{adminClient, http.MethodPost, "/panel/api/setting/update", http.StatusNoContent},
		{adminClient, http.MethodPost, "/panel/api/setting/users", http.StatusCreated},
	} {
		resp, err := call.client.do(call.method, call.path, "")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != call.want {
			t.Errorf("%s %s = %d, want %d", call.method, call.path, resp.StatusCode, call.want)
		}
	}
}

func TestUserRoleInboundAndClientScope(t *testing.T) {
	engine := newRoleTestEngine(t)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	ops, err := users.CreatePanelUser("ops", "ops-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	db := database.GetDB()
	adminInbound := model.Inbound{UserId: admin.Id, Port: 443, Protocol: model.VLESS, Tag: "admin-in", Enable: true, Settings: `{"clients":[]}`}
	opsInbound := model.Inbound{UserId: ops.Id, Port: 8443, Protocol: model.VLESS, Tag: "ops-in", Enable: true, Settings: `{"clients":[]}`}
	if err := db.Create(&adminInbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&opsInbound).Error; err != nil {
		t.Fatal(err)
	}
	other := model.ClientRecord{Email: "other@example.com", Enable: true}
	mine := model.ClientRecord{Email: "mine@example.com", Enable: true}
	if err := db.Create(&other).Error; err != nil || db.Create(&mine).Error != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: other.Id, InboundId: adminInbound.Id}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: mine.Id, InboundId: opsInbound.Id}).Error; err != nil {
		t.Fatal(err)
	}

	client := roleClient(t, engine, ops.Id)
	listResp, err := client.do(http.MethodGet, "/panel/api/inbounds/list", "")
	if err != nil {
		t.Fatal(err)
	}
	defer listResp.Body.Close()
	body := readBody(t, listResp)
	if strings.Contains(body, "admin-in") || !strings.Contains(body, "ops-in") {
		t.Fatalf("inbound list = %s", body)
	}

	updResp, err := client.do(http.MethodPost, "/panel/api/inbounds/update/"+strconv.Itoa(adminInbound.Id), `{}`)
	if err != nil {
		t.Fatal(err)
	}
	updResp.Body.Close()
	if updResp.StatusCode != http.StatusNotFound {
		t.Fatalf("update foreign inbound = %d, want 404", updResp.StatusCode)
	}
	var stored model.Inbound
	if err := db.First(&stored, adminInbound.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Remark != "" || stored.Tag != "admin-in" {
		t.Fatalf("foreign inbound changed: %+v", stored)
	}

	clientsResp, err := client.do(http.MethodGet, "/panel/api/clients/list", "")
	if err != nil {
		t.Fatal(err)
	}
	defer clientsResp.Body.Close()
	clientsBody := readBody(t, clientsResp)
	if strings.Contains(clientsBody, "other@example.com") || !strings.Contains(clientsBody, "mine@example.com") {
		t.Fatalf("client list = %s", clientsBody)
	}
}

func TestLastAdminAndPasswordDoNotClearTwoFactor(t *testing.T) {
	engine := newRoleTestEngine(t)
	_ = engine
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	ops, err := users.CreatePanelUser("ops", "ops-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	if err := users.SetPanelUserRole(admin.Id, model.RoleUser); err == nil {
		t.Fatal("demoting the only admin succeeded")
	}
	reloaded, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	if !reloaded.IsAdmin() {
		t.Fatal("only admin was demoted")
	}

	settings := service.SettingService{}
	if err := settings.SetTwoFactorEnable(true); err != nil {
		t.Fatal(err)
	}
	if err := settings.SetTwoFactorToken("secret"); err != nil {
		t.Fatal(err)
	}
	before := model.User{}
	if err := database.GetDB().First(&before, admin.Id).Error; err != nil {
		t.Fatal(err)
	}
	if err := users.UpdateUser(ops.Id, "ops", "changed-pass"); err != nil {
		t.Fatal(err)
	}
	enabled, err := settings.GetTwoFactorEnable()
	if err != nil || !enabled {
		t.Fatalf("two factor enable = %v, err = %v", enabled, err)
	}
	token, err := settings.GetTwoFactorToken()
	if err != nil || token != "secret" {
		t.Fatalf("two factor token = %q, err = %v", token, err)
	}
	after := model.User{}
	if err := database.GetDB().First(&after, admin.Id).Error; err != nil {
		t.Fatal(err)
	}
	if after.LoginEpoch != before.LoginEpoch {
		t.Fatalf("admin login epoch changed from %d to %d", before.LoginEpoch, after.LoginEpoch)
	}
}

func TestPanelUserDeletionRequiresInboundTransfer(t *testing.T) {
	_ = newRoleTestEngine(t)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := users.CreatePanelUser("short", "123", model.RoleUser); err == nil {
		t.Fatal("accepted a short password")
	}
	owner, err := users.CreatePanelUser("owner", "owner-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := users.CreatePanelUser("owner", "other-pass", model.RoleUser); err == nil {
		t.Fatal("accepted a duplicate username")
	}
	inbound := model.Inbound{UserId: owner.Id, Port: 8443, Protocol: model.VLESS, Tag: "owned"}
	if err := database.GetDB().Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	listed, err := users.ListPanelUsers()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range listed {
		if row.Id == owner.Id && row.InboundCount != 1 {
			t.Fatalf("inbound count = %d, want 1", row.InboundCount)
		}
	}
	if err := users.DeletePanelUser(owner.Id, 0); err == nil {
		t.Fatal("deleted account with unassigned inbound")
	}
	if err := users.DeletePanelUser(owner.Id, admin.Id); err != nil {
		t.Fatal(err)
	}
	var updated model.Inbound
	if err := database.GetDB().First(&updated, inbound.Id).Error; err != nil {
		t.Fatal(err)
	}
	if updated.UserId != admin.Id {
		t.Fatalf("inbound owner = %d, want %d", updated.UserId, admin.Id)
	}
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	buf, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(buf)
}
