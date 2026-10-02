package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestCommerceOrderLifecycle(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	administrator := roleClient(t, engine, admin.Id)
	request := func(client roleSession, method, path, body string, success bool) json.RawMessage {
		t.Helper()
		response, err := client.do(method, "/panel/api/"+path, body)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		var result struct {
			Success bool
			Msg     string
			Obj     json.RawMessage
		}
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if result.Success != success {
			t.Fatalf("%s %s success=%v: %s", method, path, result.Success, result.Msg)
		}
		return result.Obj
	}
	inbound := model.Inbound{UserId: admin.Id, Port: 24567, Protocol: model.VLESS, Tag: "commerce-test", Enable: false, Settings: `{"clients":[]}`, StreamSettings: `{"network":"tcp","security":"none"}`}
	if err := db.Create(&inbound).Error; err != nil {
		t.Fatal(err)
	}
	groupJSON := request(administrator, http.MethodPost, "node-groups/save", fmt.Sprintf(`{"name":"Asia","inboundIds":[%d,%d]}`, inbound.Id, inbound.Id), true)
	var group nodeGroupInput
	if err := json.Unmarshal(groupJSON, &group); err != nil {
		t.Fatal(err)
	}
	if len(group.InboundIDs) != 1 {
		t.Fatalf("duplicate members: %+v", group.InboundIDs)
	}
	body := fmt.Sprintf(`{"name":"Commercial","nodeGroupIds":[%d],"inboundIds":[],"totalGB":1073741824,"durationDays":10,"enabled":true,"prices":[{"period":"monthly","days":30,"amount":990}]}`, group.ID)
	planJSON := request(administrator, http.MethodPost, "subscription-plans/save", body, true)
	var plan planInput
	if err := json.Unmarshal(planJSON, &plan); err != nil {
		t.Fatal(err)
	}
	request(administrator, http.MethodPost, "node-groups/delete", fmt.Sprintf(`{"id":%d}`, group.ID), false)
	createUser := func(name string) *model.User {
		t.Helper()
		request(administrator, http.MethodPost, "subscription-plans/subscribe", fmt.Sprintf(`{"username":%q,"password":"secure-password"}`, name), true)
		var user model.User
		if err := db.First(&user, "username = ?", name).Error; err != nil {
			t.Fatal(err)
		}
		return &user
	}
	user, other := createUser("buyer"), createUser("other-buyer")
	buyer := roleClient(t, engine, user.Id)
	outsider := roleClient(t, engine, other.Id)
	catalog := request(buyer, http.MethodGet, "commerce/plans", "", true)
	if strings.Contains(string(catalog), "inboundIds") {
		t.Fatal("catalog leaks configuration")
	}
	makeOrder := func() model.ServiceOrder {
		t.Helper()
		var order model.ServiceOrder
		raw := request(buyer, http.MethodPost, "commerce/orders", fmt.Sprintf(`{"planId":%d,"period":"monthly","amount":1}`, plan.ID), true)
		if err := json.Unmarshal(raw, &order); err != nil {
			t.Fatal(err)
		}
		if order.Amount != 990 || order.Currency != "CNY" || order.Status != "pending" {
			t.Fatalf("invalid server quote: %+v", order)
		}
		return order
	}
	order := makeOrder()
	request(buyer, http.MethodPost, "commerce/orders", fmt.Sprintf(`{"planId":%d,"period":"monthly"}`, plan.ID), false)
	request(outsider, http.MethodPost, "commerce/orders/"+order.ID+"/cancel", `{}`, false)
	otherOrders := request(outsider, http.MethodGet, "commerce/orders", "", true)
	if strings.Contains(string(otherOrders), order.ID) {
		t.Fatal("other user can see order")
	}
	for _, path := range []string{"commerce/orders/" + order.ID + "/confirm", "node-groups/save"} {
		response, err := buyer.do(http.MethodPost, "/panel/api/"+path, `{"note":"forged payment"}`)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("%s allowed customer: %d", path, response.StatusCode)
		}
	}
	request(administrator, http.MethodPost, "subscription-plans/delete", fmt.Sprintf(`{"id":%d}`, plan.ID), false)
	// A later price edit must not change an existing order's quote or service.
	if err := db.Model(&model.SubscriptionPlan{}).Where("id = ?", plan.ID).Updates(map[string]any{"prices": `[{"period":"monthly","days":30,"amount":1990}]`, "total_gb": int64(2147483648)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&inbound).Update("settings", "invalid-json").Error; err != nil {
		t.Fatal(err)
	}
	request(administrator, http.MethodPost, "commerce/orders/"+order.ID+"/confirm", `{"note":"receipt-001"}`, false)
	if err := db.First(&order, "id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != "failed" || order.PaidAt == 0 || order.TargetExpiry == 0 || order.LastError == "" {
		t.Fatalf("failure not recoverable: %+v", order)
	}
	target := order.TargetExpiry
	if err := db.Model(&inbound).Update("settings", `{"clients":[]}`).Error; err != nil {
		t.Fatal(err)
	}
	request(administrator, http.MethodPost, "commerce/orders/"+order.ID+"/confirm", `{"note":"retry"}`, true)
	var rec model.ClientRecord
	if err := db.First(&rec, *user.ClientID).Error; err != nil {
		t.Fatal(err)
	}
	if rec.ExpiryTime != target || rec.TotalGB != 1073741824 {
		t.Fatalf("snapshot/retry violated: expiry=%d quota=%d", rec.ExpiryTime, rec.TotalGB)
	}
	subID := rec.SubID
	request(administrator, http.MethodPost, "commerce/orders/"+order.ID+"/confirm", `{"note":"duplicate"}`, true)
	db.First(&rec, rec.Id)
	if rec.ExpiryTime != target || rec.SubID != subID {
		t.Fatal("duplicate confirmation changed identity or expiry")
	}
	if err := db.First(&order, "id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != "completed" || order.PaymentNote != "receipt-001" || order.Amount != 990 {
		t.Fatalf("payment record changed: %+v", order)
	}
	// Move the next quote back to its original amount for the renewal helper.
	db.Model(&model.SubscriptionPlan{}).Where("id = ?", plan.ID).Update("prices", `[{"period":"monthly","days":30,"amount":990}]`)
	renewal := makeOrder()
	request(administrator, http.MethodPost, "commerce/orders/"+renewal.ID+"/confirm", `{"note":"renewal receipt"}`, true)
	db.First(&rec, rec.Id)
	if rec.ExpiryTime != target+30*86400000 || rec.SubID != subID {
		t.Fatal("renewal did not extend existing expiry exactly once")
	}
	cancelled := makeOrder()
	request(buyer, http.MethodPost, "commerce/orders/"+cancelled.ID+"/cancel", `{}`, true)
	request(administrator, http.MethodPost, "commerce/orders/"+cancelled.ID+"/confirm", `{"note":"late receipt"}`, false)
	expired := makeOrder()
	db.Model(&expired).Update("expires_at", time.Now().Add(-time.Minute).UnixMilli())
	request(buyer, http.MethodGet, "commerce/orders", "", true)
	request(administrator, http.MethodPost, "commerce/orders/"+expired.ID+"/confirm", `{"note":"late receipt"}`, false)
	db.First(&expired, "id = ?", expired.ID)
	if expired.Status != "expired" {
		t.Fatal("pending order did not expire")
	}
}

func TestCommerceConcurrentCheckout(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	admin, err := (&panel.UserService{}).GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	ib := model.Inbound{UserId: admin.Id, Port: 24568, Protocol: model.VLESS, Tag: "concurrent-order", Enable: false, Settings: `{"clients":[]}`}
	db.Create(&ib)
	p := model.SubscriptionPlan{Name: "Concurrent", Enabled: true, InboundIDs: fmt.Sprintf("[%d]", ib.Id), Prices: `[{"period":"monthly","days":30,"amount":100}]`}
	db.Create(&p)
	rec := model.ClientRecord{Email: "parallel-buyer", SubID: "parallel-sub", Enable: true}
	db.Create(&rec)
	user := model.User{Username: "parallel-buyer", Role: model.RoleCustomer, ClientID: &rec.Id}
	db.Create(&user)
	clients := []roleSession{roleClient(t, engine, user.Id), roleClient(t, engine, user.Id)}
	results := make(chan bool, 2)
	var wg sync.WaitGroup
	for _, client := range clients {
		wg.Go(func() {
			response, e := client.do(http.MethodPost, "/panel/api/commerce/orders", fmt.Sprintf(`{"planId":%d,"period":"monthly"}`, p.ID))
			if e != nil {
				results <- false
				return
			}
			defer response.Body.Close()
			var outcome struct{ Success bool }
			if e := json.NewDecoder(response.Body).Decode(&outcome); e != nil {
				results <- false
				return
			}
			results <- outcome.Success
		})
	}
	wg.Wait()
	close(results)
	successes := 0
	for success := range results {
		if success {
			successes++
		}
	}
	var count int64
	db.Model(&model.ServiceOrder{}).Where("user_id = ?", user.Id).Count(&count)
	if successes != 1 || count != 1 {
		t.Fatalf("duplicate checkout: successes=%d orders=%d", successes, count)
	}
}
