package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestMyDevicesOwnershipAndUnbinding(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	clients := []model.ClientRecord{{Email: "devices-own", SubID: "own-devices-sub", Enable: true, LimitHwid: 3}, {Email: "devices-other", SubID: "other-devices-sub", Enable: true, LimitHwid: 3}}
	users := make([]model.User, 2)
	svc := &service.ClientService{}
	for i := range clients {
		if err := db.Create(&clients[i]).Error; err != nil {
			t.Fatal(err)
		}
		users[i] = model.User{Username: fmt.Sprintf("device-user-%d", i), Password: admin.Password, Role: model.RoleCustomer, ClientID: &clients[i].Id}
		if err := db.Create(&users[i]).Error; err != nil {
			t.Fatal(err)
		}
		for device := 0; device < 3; device++ {
			if result, err := svc.EnforceHwidForSubID(clients[i].SubID, service.HwidRequest{Hwid: fmt.Sprintf("physical-%d-%d", i, device), SourceIP: "192.0.2.42", DeviceModel: fmt.Sprintf("phone-%d-%d", i, device)}); err != nil || !result.Allowed {
				t.Fatal(result, err)
			}
		}
	}
	customer := roleClient(t, engine, users[0].Id)
	if err := db.Create(&model.ServerClientUsage{Email: clients[0].Email, NodeId: 0, Up: 10, Down: 20}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ServerClientUsage{Email: clients[1].Email, NodeId: 0, Up: 999999, Down: 999999}).Error; err != nil {
		t.Fatal(err)
	}
	for _, record := range []model.ClientUsageHour{
		{Email: clients[0].Email, NodeID: 0, Bucket: time.Now().UTC().Truncate(time.Hour).UnixMilli(), Up: 10, Down: 20},
		{Email: clients[1].Email, NodeID: 0, Bucket: time.Now().UTC().Truncate(time.Hour).UnixMilli(), Up: 999999, Down: 999999},
	} {
		if err := db.Create(&record).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{"/myUsage?resolution=day&email=devices-other", "/myConnections?email=devices-other"} {
		r, err := customer.do(http.MethodGet, "/panel/api/clients"+path, "")
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(r.Body)
		r.Body.Close()
		if err != nil || r.StatusCode != http.StatusOK || !strings.Contains(string(body), `"success":true`) || strings.Contains(string(body), "999999") || strings.Contains(string(body), "192.0.2.42") {
			t.Fatal("own view leaked another user or IP", string(body), err)
		}
		if strings.Contains(path, "myUsage") {
			var usage struct {
				Success bool
				Obj     service.ClientUsageView
			}
			if err := json.Unmarshal(body, &usage); err != nil || usage.Obj.Traffic.Total != 30 || len(usage.Obj.Points) != 1 || usage.Obj.Points[0].Down != 20 {
				t.Fatal("missing own traffic history", string(body), err)
			}
		}
	}
	for _, path := range []string{"/activity/devices-own", "/devices/devices-own", "/myUsage?resolution=invalid"} {
		r, err := customer.do(http.MethodGet, "/panel/api/clients"+path, "")
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		want := http.StatusForbidden
		if strings.Contains(path, "invalid") {
			want = http.StatusBadRequest
		}
		if r.StatusCode != want {
			t.Fatal("private or invalid endpoint accessible", path, r.StatusCode)
		}
	}
	response, err := customer.do(http.MethodGet, "/panel/api/clients/myDevices?email=devices-other&clientId=999", "")
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatal(response.StatusCode, err)
	}
	var report struct {
		Success bool
		Obj     service.ClientDeviceSlots
	}
	if err := json.Unmarshal(body, &report); err != nil {
		t.Fatal(err)
	}
	if !report.Success || !report.Obj.Full || report.Obj.Registered != 3 || report.Obj.Remaining != 0 || report.Obj.Limit != 3 {
		t.Fatalf("unexpected own slot report: %s", body)
	}
	for _, secret := range []string{"192.0.2.42", "own-devices-sub", "physical-", "phone-1-", "hwidHash"} {
		if strings.Contains(string(body), secret) {
			t.Fatalf("device response leaked %q: %s", secret, body)
		}
	}
	if report.Obj.Devices[0].LastIP != "192.0.*.42" {
		t.Fatal("full source IP exposed")
	}
	foreign, err := svc.ListClientHwids(clients[1].Email)
	if err != nil {
		t.Fatal(err)
	}
	deleteDevice := func(id int, want bool) {
		t.Helper()
		r, err := customer.do(http.MethodDelete, fmt.Sprintf("/panel/api/clients/myDevices/%d?email=devices-other", id), `{"clientId":999,"email":"devices-other"}`)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var result struct{ Success bool }
		if err := json.NewDecoder(r.Body).Decode(&result); err != nil || result.Success != want {
			t.Fatalf("delete %d success=%v want %v error=%v", id, result.Success, want, err)
		}
	}
	deleteDevice(foreign[0].Id, false)
	deleteDevice(report.Obj.Devices[0].Id, true)
	if slots, err := svc.DeviceSlots(clients[0].Email); err != nil || slots.Registered != 2 || slots.Remaining != 1 || slots.Full {
		t.Fatalf("own slot not released: %+v, %v", slots, err)
	}
	if slots, err := svc.DeviceSlots(clients[1].Email); err != nil || slots.Registered != 3 {
		t.Fatalf("foreign devices changed: %+v, %v", slots, err)
	}
	if result, err := svc.EnforceHwidForSubID(clients[0].SubID, service.HwidRequest{Hwid: "new-phone-device"}); err != nil || !result.Allowed || result.Registered != 3 {
		t.Fatalf("replacement device rejected after unbinding: %+v, %v", result, err)
	}
	adminPath := fmt.Sprintf("/panel/api/clients/hwids/%s/%d", clients[1].Email, foreign[0].Id)
	r, err := customer.do(http.MethodDelete, adminPath, "")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != http.StatusForbidden {
		t.Fatal("customer accessed administrator unbinding", r.StatusCode)
	}
	r, err = roleClient(t, engine, admin.Id).do(http.MethodDelete, adminPath, "")
	if err != nil {
		t.Fatal(err)
	}
	var removed struct{ Success bool }
	if err := json.NewDecoder(r.Body).Decode(&removed); err != nil || !removed.Success {
		r.Body.Close()
		t.Fatal("administrator could not unbind device", err)
	}
	r.Body.Close()
	if slots, err := svc.DeviceSlots(clients[1].Email); err != nil || slots.Registered != 2 || slots.Remaining != 1 {
		t.Fatalf("administrator unbind did not free a slot: %+v, %v", slots, err)
	}
	for _, rawID := range []string{"0", "-1", "abc"} {
		r, err := customer.do(http.MethodDelete, "/panel/api/clients/myDevices/"+rawID, "")
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != http.StatusBadRequest {
			t.Fatal("invalid device id accepted", rawID, r.StatusCode)
		}
	}
	for _, scope := range []string{model.ApiScopeAdmin, model.ApiScopeNodeSync, model.ApiScopeMonitor} {
		token, err := (&panel.ApiTokenService{}).Create("my-devices-"+scope, scope, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, method := range []string{http.MethodGet, http.MethodDelete} {
			path := "/panel/api/clients/myDevices"
			if method == http.MethodDelete {
				path += "/1"
			}
			req := httptest.NewRequest(method, path, nil)
			req.Header.Set("Authorization", "Bearer "+token.Token)
			r := httptest.NewRecorder()
			engine.ServeHTTP(r, req)
			if r.Code != http.StatusForbidden {
				t.Fatalf("%s %s unexpectedly exposes customer devices: %d", scope, method, r.Code)
			}
		}
	}
}

func TestMyDevicesRejectUnlinkedAndSharedSubscriptions(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	clients := []model.ClientRecord{{Email: "shared-1", SubID: "shared-devices", Enable: true}, {Email: "shared-2", SubID: "shared-devices", Enable: true}}
	for i := range clients {
		if err := db.Create(&clients[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	users := []model.User{{Username: "devices-unlinked", Role: model.RoleCustomer}, {Username: "devices-shared", Role: model.RoleCustomer, ClientID: &clients[0].Id}}
	for i := range users {
		if err := db.Create(&users[i]).Error; err != nil {
			t.Fatal(err)
		}
		for _, method := range []string{http.MethodGet, http.MethodDelete} {
			path := "/panel/api/clients/myDevices"
			if method == http.MethodDelete {
				path += "/1"
			}
			r, err := roleClient(t, engine, users[i].Id).do(method, path, "")
			if err != nil {
				t.Fatal(err)
			}
			r.Body.Close()
			if r.StatusCode != http.StatusForbidden {
				t.Fatal("unlinked/shared customer could access devices", users[i].Username, r.StatusCode)
			}
		}
	}
}
