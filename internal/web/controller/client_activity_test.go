package controller

import (
	"net/http"
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
