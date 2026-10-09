package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func (a *ClientController) devices(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var client model.ClientRecord
	if err := database.GetDB().Where("email = ?", c.Param("email")).First(&client).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	result, err := a.clientService.Devices(c.Request.Context(), client.Email)
	jsonObj(c, result, err)
}

// This route is local-only so a parent's node-sync request never fans out.
func (a *ClientController) connections(c *gin.Context) {
	scope, _ := c.Get("api_token_scope")
	u := session.GetLoginUser(c)
	if scope != model.ApiScopeNodeSync && (u == nil || !u.IsAdmin()) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var client model.ClientRecord
	if err := database.GetDB().Where("email = ?", c.Param("email")).First(&client).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	result := a.clientService.LocalClientConnections(client.Email)
	if scope != model.ApiScopeNodeSync {
		for i := range result.Connections {
			result.Connections[i].IP = service.MaskDeviceIP(result.Connections[i].IP)
		}
	}
	jsonObj(c, result, nil)
}
