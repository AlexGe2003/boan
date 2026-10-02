package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"gorm.io/gorm"
)

func (a *NodeController) groupBuy(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	report, err := a.nodeService.GroupBuy()
	jsonObj(c, report, err)
}

func (a *NodeController) setGroupBuy(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil || !user.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var config model.NodeGroupBuyConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		jsonObj(c, nil, err)
		return
	}
	err := a.nodeService.SetGroupBuy(config)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	jsonObj(c, nil, err)
}
