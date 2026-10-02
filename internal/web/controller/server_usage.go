package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func (a *NodeController) usage(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	email := c.Query("email")
	var nodeID *int
	if value, ok := c.GetQuery("nodeId"); ok {
		id, err := strconv.Atoi(value)
		if err != nil || id < 0 || email != "" {
			jsonObj(c, nil, errors.New("请选择一个用户或节点"))
			return
		}
		if id > 0 {
			var n model.Node
			if err := database.GetDB().Select("id").First(&n, id).Error; err != nil {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
		}
		nodeID = &id
	}
	if email != "" {
		var client model.ClientRecord
		if err := database.GetDB().Select("id").Where("email = ?", email).First(&client).Error; err != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
	}
	result, err := a.nodeService.Usage(email, nodeID)
	jsonObj(c, result, err)
}

func (a *NodeController) setUsageBilling(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var request service.ServerUsageBillingRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		jsonObj(c, nil, err)
		return
	}
	err := a.nodeService.SetUsageBilling(request)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	jsonObj(c, nil, err)
}

func (a *NodeController) setUsageControl(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var request service.ServerUsageControlRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		jsonObj(c, nil, err)
		return
	}
	err := a.nodeService.SetUsageControl(request)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	jsonObj(c, nil, err)
}
