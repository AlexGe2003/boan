package controller

import (
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestNodeGroupBuyAdminOnly(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	customer := model.User{Username: "group-customer", Password: admin.Password, Role: model.RoleCustomer}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ id, status int }{{customer.Id, http.StatusForbidden}, {admin.Id, http.StatusOK}} {
		client := roleClient(t, engine, tc.id)
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			response, err := client.do(method, "/panel/api/nodes/group-buy", `{"nodeId":0,"monthlyPrice":10000,"feeMode":"percent","feeValue":1000,"bandwidthMode":"shared","memberCount":10}`)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if response.StatusCode != tc.status {
				t.Fatalf("%s permission=%d want=%d", method, response.StatusCode, tc.status)
			}
		}
		var count int64
		db.Model(&model.NodeGroupBuyConfig{}).Count(&count)
		if tc.id == customer.Id && count != 0 {
			t.Fatal("customer modified configuration")
		}
		if tc.id == admin.Id && count != 1 {
			t.Fatal("admin configuration not saved")
		}
	}
	response, err := roleClient(t, engine, admin.Id).do(http.MethodPost, "/panel/api/nodes/group-buy", `{"nodeId":999,"feeMode":"fixed","bandwidthMode":"shared"}`)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("missing node status: %d", response.StatusCode)
	}
}
