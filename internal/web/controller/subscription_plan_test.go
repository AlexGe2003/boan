package controller

import (
	"encoding/json"
	"fmt"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
	"net/http"
	"testing"
)

func TestSubscriptionPlanAccountAndReapply(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	users := panel.UserService{}
	admin, err := users.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	client := roleClient(t, engine, admin.Id)
	inbound := model.Inbound{UserId: admin.Id, Port: 23456, Protocol: model.VLESS, Tag: "plan-test", Enable: false, Settings: `{"clients":[]}`, StreamSettings: `{"network":"tcp","security":"none"}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	request := func(path, body string, wantSuccess bool) json.RawMessage {
		t.Helper()
		r, e := client.do(http.MethodPost, "/panel/api/subscription-plans/"+path, body)
		if e != nil {
			t.Fatal(e)
		}
		defer r.Body.Close()
		var v struct {
			Success bool            `json:"success"`
			Msg     string          `json:"msg"`
			Obj     json.RawMessage `json:"obj"`
		}
		if e = json.NewDecoder(r.Body).Decode(&v); e != nil {
			t.Fatal(e)
		}
		if v.Success != wantSuccess {
			t.Fatalf("%s: success=%v msg=%s", path, v.Success, v.Msg)
		}
		return v.Obj
	}
	request("subscribe", `{"username":"account-first","password":"secure-password"}`, true)
	unassigned, err := users.CheckUser("account-first", "secure-password", "")
	if err != nil || unassigned == nil || unassigned.Role != model.RoleCustomer || unassigned.ClientID == nil {
		t.Fatalf("account without plan cannot log in: %v", err)
	}
	checkConfigured := func(want bool) {
		t.Helper()
		customer := roleClient(t, engine, unassigned.Id)
		r, err := customer.do(http.MethodGet, "/panel/api/clients/mySubscriptions", "")
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var result struct {
			Success bool
			Obj     []struct{ Configured bool }
		}
		if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if !result.Success || len(result.Obj) != 1 || result.Obj[0].Configured != want {
			t.Fatalf("configured response: %+v", result)
		}
	}
	checkConfigured(false)
	var assignedCount int64
	db.Model(&model.SubscriptionAssignment{}).Where("client_id = ?", *unassigned.ClientID).Count(&assignedCount)
	if assignedCount != 0 {
		t.Fatal("account received a plan during creation")
	}
	obj := request("save", fmt.Sprintf(`{"name":"Standard","inboundIds":[%d],"totalGB":1000000,"durationDays":30,"limitHwid":3,"enabled":true}`, inbound.Id), true)
	var p planInput
	if err := json.Unmarshal(obj, &p); err != nil {
		t.Fatal(err)
	}
	request("apply", fmt.Sprintf(`{"planId":%d,"emails":["account-first"]}`, p.ID), true)
	checkConfigured(true)
	db.Model(&model.SubscriptionAssignment{}).Where("client_id = ?", *unassigned.ClientID).Count(&assignedCount)
	if assignedCount != 1 {
		t.Fatal("could not assign plan after account creation")
	}
	request("subscribe", fmt.Sprintf(`{"username":"plan-customer","password":"secure-password","planId":%d}`, p.ID), true)
	u, err := users.CheckUser("plan-customer", "secure-password", "")
	if err != nil {
		t.Fatal(err)
	}
	if u.Role != model.RoleCustomer || u.ClientID == nil {
		t.Fatal("not linked customer")
	}
	var rec model.ClientRecord
	db.First(&rec, *u.ClientID)
	subID, credential, expiry := rec.SubID, rec.UUID, rec.ExpiryTime
	if subID == "" || credential == "" || expiry <= 0 || rec.TotalGB != 1000000 || rec.LimitHwid != 3 {
		t.Fatalf("wrong subscription: %+v", rec)
	}
	db.Model(&xray.ClientTraffic{}).Where("email = ?", rec.Email).Updates(map[string]any{"up": 123, "down": 456})
	request("apply", fmt.Sprintf(`{"emails":["plan-customer"],"planId":%d}`, p.ID), true)
	db.First(&rec, *u.ClientID)
	if rec.SubID != subID || rec.UUID != credential || rec.ExpiryTime != expiry {
		t.Fatal("reapply changed identity or expiry")
	}
	var traffic xray.ClientTraffic
	db.Where("email = ?", rec.Email).First(&traffic)
	if traffic.Up != 123 || traffic.Down != 456 {
		t.Fatal("reapply reset traffic")
	}
	var links int64
	db.Model(&model.ClientInbound{}).Where("client_id = ?", rec.Id).Count(&links)
	if links != 1 {
		t.Fatalf("links=%d", links)
	}

	request("subscribe", fmt.Sprintf(`{"username":"plan-customer-two","password":"secure-password","planId":%d}`, p.ID), true)
	var other model.ClientRecord
	db.Where("email = ?", "plan-customer-two").First(&other)
	if other.SubID == rec.SubID || other.UUID == rec.UUID {
		t.Fatal("plan users share credentials")
	}
	second := model.Inbound{UserId: admin.Id, Port: 23457, Protocol: model.VLESS, Tag: "plan-test-two", Enable: false, Settings: `{"clients":[]}`, StreamSettings: `{"network":"tcp","security":"none"}`}
	if err := db.Create(&second).Error; err != nil {
		t.Fatal(err)
	}
	nextObj := request("save", fmt.Sprintf(`{"name":"Alternate","inboundIds":[%d],"totalGB":2000000,"durationDays":60,"enabled":true}`, second.Id), true)
	var next planInput
	json.Unmarshal(nextObj, &next)
	request("apply", fmt.Sprintf(`{"emails":["plan-customer"],"planId":%d}`, next.ID), true)
	var actual []model.ClientInbound
	db.Where("client_id = ?", rec.Id).Find(&actual)
	if len(actual) != 1 || actual[0].InboundId != second.Id {
		t.Fatalf("old plan nodes remain: %+v", actual)
	}
	db.First(&rec, rec.Id)
	if rec.SubID != subID || rec.TotalGB != 2000000 || rec.ExpiryTime <= expiry {
		t.Fatal("plan switch incorrect")
	}
	request("subscribe", fmt.Sprintf(`{"username":"plan-customer","password":"other-password","planId":%d}`, p.ID), false)
	request("delete", fmt.Sprintf(`{"id":%d}`, p.ID), false)
	request("save", `{"name":"Invalid","inboundIds":[999999],"enabled":true}`, false)

	// Failure leaves a recoverable account; retry never needs a new password.
	db.Model(&inbound).Update("settings", "invalid-json")
	partial := request("subscribe", fmt.Sprintf(`{"username":"retry-customer","password":"secure-password","planId":%d}`, p.ID), false)
	var outcome struct {
		Created bool `json:"created"`
	}
	if err := json.Unmarshal(partial, &outcome); err != nil || !outcome.Created {
		t.Fatal("missing recoverable creation result")
	}
	db.Model(&inbound).Update("settings", `{"clients":[]}`)
	request("apply", fmt.Sprintf(`{"emails":["retry-customer"],"planId":%d}`, p.ID), true)
	var retryCount int64
	db.Model(&model.User{}).Where("username = ?", "retry-customer").Count(&retryCount)
	if retryCount != 1 {
		t.Fatal("retry duplicated account")
	}

	if err := db.Create(&model.Setting{Key: "defaultSubscriptionPlanId", Value: fmt.Sprint(p.ID)}).Error; err != nil {
		t.Fatal(err)
	}
	request("subscribe", `{"username":"default-plan-customer","password":"secure-password"}`, true)
	defaultUser, err := users.CheckUser("default-plan-customer", "secure-password", "")
	if err != nil {
		t.Fatal(err)
	}
	var defaultAssignment model.SubscriptionAssignment
	if err := db.First(&defaultAssignment, "client_id = ?", *defaultUser.ClientID).Error; err != nil || defaultAssignment.PlanID != p.ID {
		t.Fatalf("default plan not applied: %+v %v", defaultAssignment, err)
	}
	request("subscribe", `{"username":"account-only-default","password":"secure-password","accountOnly":true}`, true)
	accountFirst, err := users.CheckUser("account-only-default", "secure-password", "")
	if err != nil {
		t.Fatal(err)
	}
	var assignments int64
	db.Model(&model.SubscriptionAssignment{}).Where("client_id = ?", *accountFirst.ClientID).Count(&assignments)
	if assignments != 0 {
		t.Fatal("account-only creation assigned the default plan")
	}
	request("apply", fmt.Sprintf(`{"emails":["account-only-default"],"planId":%d}`, p.ID), true)
	var assigned model.SubscriptionAssignment
	if err := db.First(&assigned, "client_id = ?", *accountFirst.ClientID).Error; err != nil || assigned.PlanID != p.ID {
		t.Fatalf("later plan assignment failed: %+v %v", assigned, err)
	}
	db.Model(&p.SubscriptionPlan).Update("enabled", false)
	request("subscribe", `{"username":"disabled-default-customer","password":"secure-password"}`, false)
	var rejected int64
	db.Model(&model.User{}).Where("username = ?", "disabled-default-customer").Count(&rejected)
	if rejected != 0 {
		t.Fatal("disabled default left an unconfigured account")
	}
	customer := roleClient(t, engine, u.Id)
	for _, path := range []string{"", "/save", "/apply", "/subscribe"} {
		method := http.MethodPost
		if path == "" {
			method = http.MethodGet
		}
		r, e := customer.do(method, "/panel/api/subscription-plans"+path, `{}`)
		if e != nil {
			t.Fatal(e)
		}
		r.Body.Close()
		if r.StatusCode != 403 {
			t.Fatalf("customer accessed %s: %d", path, r.StatusCode)
		}
	}
}
