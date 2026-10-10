package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestSupportOwnershipAndLifecycle(t *testing.T) {
	engine := newRoleTestEngineWithUsers(t, true)
	db := database.GetDB()
	svc := panel.UserService{}
	admin, err := svc.GetFirstAdmin()
	if err != nil {
		t.Fatal(err)
	}
	c1 := model.ClientRecord{Email: "support-a"}
	c2 := model.ClientRecord{Email: "support-b"}
	db.Create(&c1)
	db.Create(&c2)
	u1 := model.User{Username: "support-a", Role: model.RoleCustomer, ClientID: &c1.Id}
	u2 := model.User{Username: "support-b", Role: model.RoleCustomer, ClientID: &c2.Id}
	db.Create(&u1)
	db.Create(&u2)
	call := func(uid int, method, path, body string, want bool) json.RawMessage {
		t.Helper()
		client := roleClient(t, engine, uid)
		r, e := client.do(method, "/panel/api/support"+path, body)
		if e != nil {
			t.Fatal(e)
		}
		defer r.Body.Close()
		var result struct {
			Success bool
			Obj     json.RawMessage
			Msg     string
		}
		if e = json.NewDecoder(r.Body).Decode(&result); e != nil {
			t.Fatal(e)
		}
		if result.Success != want {
			t.Fatalf("%s: %s", path, result.Msg)
		}
		return result.Obj
	}
	obj := call(u1.Id, http.MethodPost, "/tickets", `{"subject":"Connection issue","body":"Please help"}`, true)
	var ticket model.SupportTicket
	json.Unmarshal(obj, &ticket)
	path := fmt.Sprintf("/tickets/%d", ticket.ID)
	call(u2.Id, http.MethodGet, path, "", false)
	call(u2.Id, http.MethodPost, path+"/reply", `{"body":"hijack"}`, false)
	call(u2.Id, http.MethodPost, path+"/close", `{}`, false)
	var others []model.SupportTicket
	json.Unmarshal(call(u2.Id, http.MethodGet, "/tickets", "", true), &others)
	if len(others) != 0 {
		t.Fatal("other user's tickets leaked")
	}
	call(admin.Id, http.MethodPost, path+"/reply", `{"body":"Please update subscription"}`, true)
	var detail struct {
		Ticket   model.SupportTicket
		Messages []model.SupportMessage
	}
	json.Unmarshal(call(u1.Id, http.MethodGet, path, "", true), &detail)
	if detail.Ticket.Status != "已回复" || len(detail.Messages) != 2 || !detail.Messages[1].FromAdmin {
		t.Fatalf("bad reply: %+v", detail)
	}
	call(u1.Id, http.MethodPost, path+"/reply", `{"body":"Resolved"}`, true)
	call(admin.Id, http.MethodPost, path+"/close", `{}`, true)
	call(u1.Id, http.MethodPost, path+"/reply", `{"body":"late"}`, false)
	ib := model.Inbound{UserId: admin.Id, Tag: "support-node", Port: 26666, Protocol: model.VLESS, Remark: "My node", Enable: true}
	if e := db.Create(&ib).Error; e != nil {
		t.Fatal(e)
	}
	if e := db.Exec("INSERT INTO client_inbounds (client_id,inbound_id) VALUES (?,?)", c1.Id, ib.Id).Error; e != nil {
		t.Fatal(e)
	}
	var mine, other []map[string]any
	json.Unmarshal(call(u1.Id, http.MethodGet, "/nodes", "", true), &mine)
	json.Unmarshal(call(u2.Id, http.MethodGet, "/nodes", "", true), &other)
	if len(mine) != 1 || len(other) != 0 {
		t.Fatal("node ownership incorrect")
	}
	if _, ok := mine[0]["settings"]; ok {
		t.Fatal("node secrets exposed")
	}
}
