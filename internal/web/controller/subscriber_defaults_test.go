package controller

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestSubscriberDefaultCredentialsAndDuplicate(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	users := &panel.UserService{}
	admin, err := users.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	client := roleClient(t, engine, admin.Id)
	create := func(body string, want bool) {
		t.Helper()
		r, err := client.do(http.MethodPost, "/panel/api/subscription-plans/subscribe", body)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var result struct {
			Success bool
			Msg     string
		}
		if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if result.Success != want {
			t.Fatalf("success=%v: %s", result.Success, result.Msg)
		}
	}
	create(`{"username":"user","password":"user"}`, true)
	user, err := users.CheckUser("user", "user", "")
	if err != nil || user == nil || user.Role != model.RoleCustomer || user.ClientID == nil {
		t.Fatalf("default account cannot log in: %v", err)
	}
	originalHash := user.Password
	create(`{"username":"user","password":"replacement-password"}`, false)
	if err := database.GetDB().First(user, user.Id).Error; err != nil {
		t.Fatal(err)
	}
	if user.Password != originalHash {
		t.Fatal("duplicate creation overwrote password")
	}
	create(`{"username":"other","password":"abcd"}`, false)
	var count int64
	database.GetDB().Model(&model.ClientRecord{}).Where("email = ?", "user").Count(&count)
	if count != 1 {
		t.Fatalf("duplicate subscriber records: %d", count)
	}
}
