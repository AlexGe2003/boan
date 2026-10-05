package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

// statusFeed is a credential-free metrics projection for independent status sites.
func (a *NodeController) statusFeed(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	nodes, err := a.nodeService.GetNodeTree()
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	local := monitoredNode{ID: 0, Local: true, Status: "online", XrayState: "stop"}
	if a.xrayService.IsXrayRunning() {
		local.XrayState = "running"
	}
	if a.serverService != nil {
		applyLocalMonitorStatus(&local, a.serverService.CurrentStatus())
	}
	local.CarrierProbes = service.LocalCarrierMonitor.Snapshot(time.Now())
	result := []gin.H{statusFeedProjection(local)}
	for _, n := range nodes {
		result = append(result, statusFeedProjection(monitoredNode{
			ID: n.Id, Status: n.Status, XrayState: n.XrayState, LastHeartbeat: n.LastHeartbeat,
			MetricsAvailable: n.LastHeartbeat > 0, CpuPct: n.CpuPct, MemPct: n.MemPct,
			UptimeSecs: n.UptimeSecs, NetUp: n.NetUp, NetDown: n.NetDown,
		}))
	}
	jsonObj(c, result, nil)
}

func statusFeedProjection(n monitoredNode) gin.H {
	return gin.H{
		"id": n.ID, "status": n.Status, "xrayState": n.XrayState, "lastHeartbeat": n.LastHeartbeat,
		"metricsAvailable": n.MetricsAvailable, "cpuPct": n.CpuPct, "memPct": n.MemPct,
		"diskPct": n.DiskPct, "uptimeSecs": n.UptimeSecs, "netUp": n.NetUp, "netDown": n.NetDown,
		"carrierProbes": n.CarrierProbes,
	}
}
