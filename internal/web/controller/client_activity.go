package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func (a *ClientController) activity(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	hours := 24
	if c.Query("hours") != "" {
		var err error
		hours, err = strconv.Atoi(c.Query("hours"))
		if err != nil || (hours != 1 && hours != 24) {
			jsonObj(c, nil, errors.New("仅支持最近 1 小时或 24 小时"))
			return
		}
	}
	scope := c.Query("scope")
	if scope != "" && scope != "web" && scope != "network" && scope != "all" {
		jsonObj(c, nil, errors.New("不支持的访问目标类型"))
		return
	}
	var client model.ClientRecord
	if err := database.GetDB().Where("email = ?", c.Param("email")).First(&client).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	result, err := a.clientService.Activity(client.Email, hours, scope)
	jsonObj(c, result, err)
}
