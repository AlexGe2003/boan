package controller

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestAdminPersonalSubscriptionKeepsManagementAccess(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	users := panel.UserService{}
	admin, err := users.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	db := database.GetDB()
	mine := model.ClientRecord{Email: "admin-personal", SubID: "admin-personal-sub", Enable: true}
	other := model.ClientRecord{Email: "another-customer", SubID: "another-sub", Enable: true}
	for _, row := range []*model.ClientRecord{&mine, &other} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Model(admin).Update("client_id", mine.Id).Error; err != nil {
		t.Fatal(err)
	}
	client := roleClient(t, engine, admin.Id)
	response, err := client.do(http.MethodGet, "/panel/api/clients/mySubscriptions", "")
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Success bool `json:"success"`
		Obj     []struct {
			Email string `json:"email"`
		} `json:"obj"`
	}
	err = json.NewDecoder(response.Body).Decode(&result)
	response.Body.Close()
	if err != nil || !result.Success || len(result.Obj) != 1 || result.Obj[0].Email != mine.Email {
		t.Fatalf("personal subscription: %+v, error: %v", result, err)
	}
	response, err = client.do(http.MethodGet, "/panel/api/clients/list", "")
	if err != nil {
		t.Fatal(err)
	}
	body := readBody(t, response)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.Contains(body, other.Email) {
		t.Fatalf("admin lost customer management: %s", body)
	}
	response, err = client.do(http.MethodPost, "/panel/api/clients/account/"+mine.Email, `{"username":"personal-admin"}`)
	if err != nil {
		t.Fatal(err)
	}
	body = readBody(t, response)
	response.Body.Close()
	if !strings.Contains(body, `"success":true`) {
		t.Fatalf("update linked login: %s", body)
	}
	var updated model.User
	if err := db.First(&updated, admin.Id).Error; err != nil || !updated.IsAdmin() {
		t.Fatalf("updating personal login removed admin role: %+v, %v", updated, err)
	}
}

func TestCustomerHomeOnlyReturnsLinkedClient(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	users := panel.UserService{}
	admin, err := users.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	db := database.GetDB()
	mine := model.ClientRecord{Email: "mine", SubID: "mine-sub", TotalGB: 1000, Enable: true}
	other := model.ClientRecord{Email: "other-secret", SubID: "other-sub", TotalGB: 9000, Enable: true}
	for _, row := range []*model.ClientRecord{&mine, &other} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&xray.ClientTraffic{Email: mine.Email, Up: 100, Down: 200, Total: 1000, ExpiryTime: 2000000000000, Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	adminClient := roleClient(t, engine, admin.Id)
	response, err := adminClient.do(http.MethodPost, "/panel/api/clients/account/mine", `{"username":"subscriber","password":"secure-pass"}`)
	if err != nil {
		t.Fatal(err)
	}
	body := readBody(t, response)
	response.Body.Close()
	if !strings.Contains(body, `"success":true`) {
		t.Fatalf("create account: %s", body)
	}
	user, err := users.CheckUser("subscriber", "secure-pass", "")
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != model.RoleCustomer || user.ClientID == nil || *user.ClientID != mine.Id {
		t.Fatalf("wrong association: %+v", user)
	}
	client := roleClient(t, engine, user.Id)
	response, err = client.do(http.MethodGet, "/panel/api/clients/mySubscriptions", "")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var home struct {
		Success bool `json:"success"`
		Obj     []struct {
			Email      string `json:"email"`
			Used       int64  `json:"used"`
			Up         int64  `json:"up"`
			Down       int64  `json:"down"`
			Remaining  int64  `json:"remaining"`
			Total      int64  `json:"total"`
			ExpiryTime int64  `json:"expiryTime"`
		} `json:"obj"`
	}
	if err := json.NewDecoder(response.Body).Decode(&home); err != nil {
		t.Fatal(err)
	}
	if !home.Success || len(home.Obj) != 1 || home.Obj[0].Email != "mine" || home.Obj[0].Up != 100 || home.Obj[0].Down != 200 || home.Obj[0].Used != 300 || home.Obj[0].Remaining != 700 || home.Obj[0].Total != 1000 || home.Obj[0].ExpiryTime != 2000000000000 {
		t.Fatalf("home: %+v", home)
	}
	if err := db.Model(&mine).Update("expiry_time", int64(2000000000000)).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&xray.ClientTraffic{}).Where("email = ?", mine.Email).Updates(map[string]any{"total": 0, "expiry_time": 0}).Error; err != nil {
		t.Fatal(err)
	}
	response, err = client.do(http.MethodGet, "/panel/api/clients/mySubscriptions", "")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(&home); err != nil {
		t.Fatal(err)
	}
	if !home.Success || len(home.Obj) != 1 || home.Obj[0].Total != 1000 || home.Obj[0].Remaining != 700 || home.Obj[0].ExpiryTime != 2000000000000 {
		t.Fatalf("synced traffic lost configured limits: %+v", home)
	}
	for _, path := range []string{"/panel/api/clients/list", "/panel/api/clients/get/other-secret", "/panel/api/inbounds/list", "/panel/api/setting/users", "/panel/api/clients/account/mine"} {
		r, err := client.do(http.MethodGet, path, "")
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != http.StatusForbidden {
			t.Fatalf("%s returned %d", path, r.StatusCode)
		}
	}
	// Removing the client must not expose another identity through inbound ownership.
	if err := db.Delete(&mine).Error; err != nil {
		t.Fatal(err)
	}
	r, err := client.do(http.MethodGet, "/panel/api/clients/mySubscriptions", "")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	body = readBody(t, r)
	if !strings.Contains(body, `"obj":[]`) {
		t.Fatalf("deleted client home: %s", body)
	}
}
