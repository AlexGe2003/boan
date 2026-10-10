package controller

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/web/service"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
)

func TestNodeMonitorShowsOnlyUsersOwnLocalInbounds(t *testing.T) {
	engine := newRoleTestEngine(t)
	users := panel.UserService{}
	admin, err := users.GetFirstUser()
	if err != nil {
		t.Fatal(err)
	}
	member, err := users.CreatePanelUser("monitor-user", "monitor-pass", model.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	memberClient := roleClient(t, engine, member.Id)
	adminClient := roleClient(t, engine, admin.Id)

	fetch := func(client roleSession) []monitoredNode {
		t.Helper()
		response, err := client.do(http.MethodGet, "/panel/api/nodes/monitor", "")
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("monitor status = %d", response.StatusCode)
		}
		var result struct {
			Success bool            `json:"success"`
			Obj     json.RawMessage `json:"obj"`
		}
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if !result.Success {
			t.Fatal("monitor request failed")
		}
		var nodes []monitoredNode
		if err := json.Unmarshal(result.Obj, &nodes); err != nil {
			t.Fatal(err)
		}
		return nodes
	}

	if nodes := fetch(memberClient); len(nodes) != 0 {
		t.Fatalf("member without local inbounds saw %d nodes", len(nodes))
	}
	if nodes := fetch(adminClient); len(nodes) != 1 || !nodes[0].Local {
		t.Fatalf("admin local node = %+v", nodes)
	}

	for _, inbound := range []model.Inbound{
		{UserId: member.Id, Tag: "member-monitor", Remark: "Member", Protocol: model.Protocol("vless"), Port: 443, Enable: true, Up: 2, Down: 3, Total: 10},
		{UserId: admin.Id, Tag: "admin-monitor", Remark: "Admin", Protocol: model.Protocol("vless"), Port: 8443, Enable: true},
	} {
		if err := database.GetDB().Create(&inbound).Error; err != nil {
			t.Fatal(err)
		}
	}
	nodes := fetch(memberClient)
	if len(nodes) != 1 || !nodes[0].Local || len(nodes[0].Inbounds) != 1 {
		t.Fatalf("member monitor = %+v", nodes)
	}
	got := nodes[0].Inbounds[0]
	if got.Remark != "Member" || got.Up != 2 || got.Down != 3 || got.Used != 5 || *got.Remaining != 5 {
		t.Fatalf("member inbound = %+v", got)
	}
}

func TestLocalMonitorUsesSystemSnapshot(t *testing.T) {
	node := monitoredNode{Local: true, Status: "online", XrayState: "stop"}
	applyLocalMonitorStatus(&node, nil)
	if node.MetricsAvailable {
		t.Fatal("missing samples must not be shown as zero usage")
	}
	status := &service.Status{Cpu: 12.5, Uptime: 600, T: time.Unix(1700000000, 0)}
	status.Mem.Current, status.Mem.Total = 256, 1024
	status.Disk.Current, status.Disk.Total = 500, 1000
	status.NetIO.Up, status.NetIO.Down = 12, 34
	applyLocalMonitorStatus(&node, status)
	if !node.MetricsAvailable || node.CpuPct != 12.5 || node.MemPct != 25 || node.DiskPct == nil || *node.DiskPct != 50 || node.NetUp != 12 || node.NetDown != 34 || node.LastHeartbeat != 1700000000 {
		t.Fatalf("incorrect local metrics: %+v", node)
	}
	if node.Status != "online" || node.XrayState != "stop" {
		t.Fatal("host metrics must not hide a stopped proxy core")
	}
}
