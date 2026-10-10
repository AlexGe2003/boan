package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
)

func (a *ClientController) myUsage(c *gin.Context) {
	client := a.myDeviceClient(c)
	if client == nil {
		return
	}
	resolution := c.DefaultQuery("resolution", "day")
	if resolution != "day" && resolution != "hour" {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	report, err := a.clientService.UsageHistory(client.Email, resolution, time.Now())
	jsonObj(c, report, err)
}

func (a *ClientController) myConnections(c *gin.Context) {
	client := a.myDeviceClient(c)
	if client == nil {
		return
	}
	report, err := a.clientService.FleetClientConnections(c.Request.Context(), client.Email)
	for i := range report.Connections {
		report.Connections[i].IP = service.MaskDeviceIP(report.Connections[i].IP)
	}
	jsonObj(c, report, err)
}
