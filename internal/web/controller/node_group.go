package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

type nodeGroupInput = service.NodeGroupView

func requireAdmin(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	c.Next()
}

func NewNodeGroupController(g *gin.RouterGroup) {
	g.Use(requireAdmin)
	g.GET("", listNodeGroups)
	g.POST("/save", saveNodeGroup)
	g.POST("/delete", deleteNodeGroup)
}

func listNodeGroups(c *gin.Context) {
	db := database.GetDB()
	var groups []model.NodeGroup
	if err := db.Order("id DESC").Find(&groups).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	var plans []model.SubscriptionPlan
	if err := db.Find(&plans).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	counts := map[int]int{}
	for _, p := range plans {
		ids, err := service.DecodePlanIDs(p.NodeGroupIDs)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		for _, id := range ids {
			counts[id]++
		}
	}
	out := make([]nodeGroupInput, 0, len(groups))
	for _, group := range groups {
		ids, err := service.DecodePlanIDs(group.InboundIDs)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		out = append(out, nodeGroupInput{group, ids, counts[group.ID]})
	}
	jsonObj(c, out, nil)
}

func saveNodeGroup(c *gin.Context) {
	var req nodeGroupInput
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	name, err := service.ValidateResourceName(req.Name)
	if err == nil && len(req.Description) > 4000 {
		err = errors.New("说明不能超过 4000 字节")
	}
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	ids, err := service.ValidateInboundIDs(database.GetDB(), req.InboundIDs)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	encoded, _ := json.Marshal(ids)
	req.Name, req.InboundIDs, req.NodeGroup.InboundIDs = name, ids, string(encoded)
	if req.ID == 0 {
		err = database.GetDB().Create(&req.NodeGroup).Error
	} else {
		var row model.NodeGroup
		err = database.GetDB().First(&row, req.ID).Error
		if err == nil {
			err = database.GetDB().Model(&row).Select("Name", "Description", "InboundIDs").Updates(&req.NodeGroup).Error
		}
	}
	jsonObj(c, req, err)
}

func deleteNodeGroup(c *gin.Context) {
	var req struct {
		ID int `json:"id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ID <= 0 {
		jsonObj(c, nil, errors.New("无效的节点分组"))
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	var plans []model.SubscriptionPlan
	if err := database.GetDB().Find(&plans).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	for _, p := range plans {
		ids, err := service.DecodePlanIDs(p.NodeGroupIDs)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		for _, id := range ids {
			if id == req.ID {
				jsonObj(c, nil, errors.New("节点分组仍被套餐引用，请先修改对应套餐"))
				return
			}
		}
	}
	result := database.GetDB().Delete(&model.NodeGroup{}, req.ID)
	err := result.Error
	if err == nil && result.RowsAffected == 0 {
		err = errors.New("节点分组不存在")
	}
	jsonObj(c, nil, err)
}
