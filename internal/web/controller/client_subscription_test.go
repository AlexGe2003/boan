package controller

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestResetSubscriptionPermissions(t *testing.T) {
	engine := newRoleTestEngine(t)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	own := model.ClientRecord{Email: "own", SubID: "old-own", UUID: "credential", TotalGB: 1000, ExpiryTime: 123456789, Enable: true}
	other := model.ClientRecord{Email: "other", SubID: "old-other"}
	for _, rec := range []*model.ClientRecord{&own, &other} {
		if err := db.Create(rec).Error; err != nil {
			t.Fatal(err)
		}
	}
	user := model.User{Username: "customer-reset", Role: model.RoleCustomer, ClientID: &own.Id}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	unlinked := model.User{Username: "unlinked-reset", Role: model.RoleCustomer}
	if err := db.Create(&unlinked).Error; err != nil {
		t.Fatal(err)
	}
	denied, err := roleClient(t, engine, unlinked.Id).do(http.MethodPost, "/panel/api/clients/resetMySubscription", "")
	if err != nil {
		t.Fatal(err)
	}
	denied.Body.Close()
	if denied.StatusCode != http.StatusForbidden {
		t.Fatalf("unlinked user reset: %d", denied.StatusCode)
	}
	customer := roleClient(t, engine, user.Id)
	response, err := customer.do(http.MethodPost, "/panel/api/clients/resetSubscription/other", "")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("customer can reset another user: %d", response.StatusCode)
	}
	reset := func(client roleSession, path, body string) {
		t.Helper()
		resp, err := client.do(http.MethodPost, path, body)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var result struct {
			Success bool
			Msg     string
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if !result.Success {
			t.Fatalf("reset failed: %s", result.Msg)
		}
	}
	reset(customer, "/panel/api/clients/resetMySubscription", `{"email":"other","clientId":999}`)
	var got model.ClientRecord
	if err := db.First(&got, own.Id).Error; err != nil {
		t.Fatal(err)
	}
	if got.SubID == own.SubID || got.SubID == "" || got.UUID != own.UUID || got.TotalGB != own.TotalGB || got.ExpiryTime != own.ExpiryTime {
		t.Fatalf("unexpected own record: %+v", got)
	}
	var untouched model.ClientRecord
	if err := db.First(&untouched, other.Id).Error; err != nil {
		t.Fatal(err)
	}
	if untouched.SubID != other.SubID {
		t.Fatal("self reset changed another client")
	}
	reset(roleClient(t, engine, admin.Id), "/panel/api/clients/resetSubscription/other", "")
	if err := db.First(&untouched, other.Id).Error; err != nil {
		t.Fatal(err)
	}
	if untouched.SubID == other.SubID {
		t.Fatal("admin reset did not rotate token")
	}
	otherToken := untouched.SubID
	reset(customer, "/panel/api/clients/resetMySubscription", `{"resetConnections":true,"email":"other","clientId":999}`)
	if err := db.First(&got, own.Id).Error; err != nil {
		t.Fatal(err)
	}
	if got.UUID == own.UUID || got.TotalGB != own.TotalGB || got.ExpiryTime != own.ExpiryTime {
		t.Fatal("own credentials were not reset or benefits changed")
	}
	if err := db.First(&untouched, other.Id).Error; err != nil {
		t.Fatal(err)
	}
	if untouched.SubID != otherToken || untouched.UUID != other.UUID {
		t.Fatal("credential reset changed another account")
	}
}
