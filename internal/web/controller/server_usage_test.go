package controller

import (
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestServerUsageAdminOnly(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	client := model.ClientRecord{Email: "usage-client", Enable: true}
	if err := db.Create(&client).Error; err != nil {
		t.Fatal(err)
	}
	customer := model.User{Username: "usage-customer", Password: admin.Password, Role: model.RoleCustomer, ClientID: &client.Id}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id     int
		query  string
		status int
	}{
		{admin.Id, "?email=usage-client", http.StatusOK},
		{admin.Id, "?nodeId=0", http.StatusOK},
		{admin.Id, "", http.StatusOK},
		{customer.Id, "", http.StatusForbidden},
		{admin.Id, "?email=missing", http.StatusNotFound},
		{admin.Id, "?nodeId=999", http.StatusNotFound},
		{customer.Id, "?email=usage-client", http.StatusForbidden},
		{customer.Id, "?nodeId=0", http.StatusForbidden},
	} {
		response, err := roleClient(t, engine, tc.id).do(http.MethodGet, "/panel/api/nodes/usage"+tc.query, "")
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("%d %s status %d want %d", tc.id, tc.query, response.StatusCode, tc.status)
		}
	}
	for _, tc := range []struct{ id, status int }{{customer.Id, http.StatusForbidden}, {admin.Id, http.StatusOK}} {
		response, err := roleClient(t, engine, tc.id).do(http.MethodPost, "/panel/api/nodes/usage/billing", `{"nodeId":0,"multiplier":2}`)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("billing permission status=%d want=%d", response.StatusCode, tc.status)
		}
		var count int64
		db.Model(&model.ServerUsageBilling{}).Where("node_id = 0 AND multiplier = 2").Count(&count)
		if tc.id == customer.Id && count != 0 {
			t.Fatal("customer changed billing")
		}
		if tc.id == admin.Id && count != 1 {
			t.Fatal("admin billing was not saved")
		}
	}
	for _, tc := range []struct{ id, status int }{{customer.Id, http.StatusForbidden}, {admin.Id, http.StatusOK}} {
		response, err := roleClient(t, engine, tc.id).do(http.MethodPost, "/panel/api/nodes/usage/control", `{"nodeId":0,"email":"usage-client","quota":100,"basis":"proxy","adjustUsage":true,"used":50}`)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("usage control status=%d want=%d", response.StatusCode, tc.status)
		}
		var count int64
		db.Model(&model.ServerUsageControl{}).Where("node_id=0 AND email='usage-client' AND quota=100 AND usage_offset=50").Count(&count)
		if tc.id == customer.Id && count != 0 {
			t.Fatal("customer changed usage controls")
		}
		if tc.id == admin.Id && count != 1 {
			t.Fatal("admin settings were not saved")
		}
	}
}
