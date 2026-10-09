package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func (a *ClientController) myDeviceClient(c *gin.Context) *model.ClientRecord {
	user := session.GetLoginUser(c)
	if user == nil || user.Role != model.RoleCustomer || user.ClientID == nil || *user.ClientID <= 0 {
		c.AbortWithStatus(http.StatusForbidden)
		return nil
	}
	var client model.ClientRecord
	if err := database.GetDB().First(&client, *user.ClientID).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return nil
	}
	if client.SubID != "" {
		var sharing int64
		if err := database.GetDB().Model(&model.ClientRecord{}).Where("sub_id = ?", client.SubID).Count(&sharing).Error; err != nil {
			jsonObj(c, nil, err)
			return nil
		}
		if sharing != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "msg": "共享订阅的设备请联系管理员管理"})
			return nil
		}
	}
	return &client
}

func (a *ClientController) myDevices(c *gin.Context) {
	client := a.myDeviceClient(c)
	if client == nil {
		return
	}
	report, err := a.clientService.DeviceSlots(client.Email)
	jsonObj(c, report, err)
}

func (a *ClientController) deleteMyDevice(c *gin.Context) {
	client := a.myDeviceClient(c)
	if client == nil {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if err := a.clientService.DeleteClientHwid(client.Email, id); err != nil {
		jsonObj(c, nil, err)
		return
	}
	jsonObj(c, gin.H{"deleted": id}, nil)
}
