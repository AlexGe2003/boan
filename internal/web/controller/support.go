package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

var supportMu sync.Mutex

func NewSupportController(g *gin.RouterGroup) {
	g.Use(func(c *gin.Context) {
		u := session.GetLoginUser(c)
		if u == nil || (!u.IsAdmin() && u.Role != model.RoleCustomer) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	})
	g.GET("/nodes", customerNodes)
	g.GET("/tickets", listSupportTickets)
	g.POST("/tickets", createSupportTicket)
	g.GET("/tickets/:id", readSupportTicket)
	g.POST("/tickets/:id/reply", replySupportTicket)
	g.POST("/tickets/:id/close", closeSupportTicket)
}

func customerNodes(c *gin.Context) {
	u := session.GetLoginUser(c)
	type row struct {
		ID         int    `json:"id"`
		Name       string `json:"name"`
		Protocol   string `json:"protocol"`
		Enabled    bool   `json:"enabled"`
		ExpiryTime int64  `json:"expiryTime"`
		Total      int64  `json:"total"`
		Up         int64  `json:"up"`
		Down       int64  `json:"down"`
	}
	rows := []row{}
	if u.ClientID == nil {
		jsonObj(c, rows, nil)
		return
	}
	err := database.GetDB().Table("inbounds ib").Select("ib.id, ib.remark AS name, ib.protocol, ib.enable AS enabled, ib.expiry_time, ib.total, ib.up, ib.down").Joins("JOIN client_inbounds ci ON ci.inbound_id=ib.id").Where("ci.client_id = ?", *u.ClientID).Order("ib.sub_sort_index ASC, ib.id ASC").Scan(&rows).Error
	type node struct {
		ID       int    `json:"id"`
		Name     string `json:"name"`
		Protocol string `json:"protocol"`
		Status   string `json:"status"`
	}
	out := []node{}
	for _, r := range rows {
		status := "已启用"
		if !r.Enabled {
			status = "已停用"
		} else if r.ExpiryTime > 0 && r.ExpiryTime <= time.Now().UnixMilli() {
			status = "已到期"
		} else if r.Total > 0 && r.Up+r.Down >= r.Total {
			status = "流量耗尽"
		}
		if r.Name == "" {
			r.Name = fmt.Sprintf("节点 %d", r.ID)
		}
		out = append(out, node{r.ID, r.Name, r.Protocol, status})
	}
	jsonObj(c, out, err)
}

func ticketScope(c *gin.Context) *gorm.DB {
	q := database.GetDB().Model(&model.SupportTicket{})
	u := session.GetLoginUser(c)
	if !u.IsAdmin() {
		q = q.Where("user_id = ?", u.Id)
	}
	return q
}

func listSupportTickets(c *gin.Context) {
	rows := []model.SupportTicket{}
	err := ticketScope(c).Order("updated_at DESC").Limit(200).Find(&rows).Error
	jsonObj(c, rows, err)
}

func ownedTicket(c *gin.Context) (model.SupportTicket, error) {
	var t model.SupportTicket
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return t, errors.New("工单不存在")
	}
	err = ticketScope(c).First(&t, id).Error
	if err != nil {
		return t, errors.New("工单不存在或无权访问")
	}
	return t, nil
}

func createSupportTicket(c *gin.Context) {
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	req.Subject = strings.TrimSpace(req.Subject)
	req.Body = strings.TrimSpace(req.Body)
	if len(req.Subject) == 0 || len(req.Subject) > 240 || len(req.Body) == 0 || len(req.Body) > 12000 {
		jsonObj(c, nil, errors.New("请填写标题（最多 240 字节）和内容（最多 12000 字节）"))
		return
	}
	supportMu.Lock()
	defer supportMu.Unlock()
	now := time.Now().UnixMilli()
	t := model.SupportTicket{UserID: session.GetLoginUser(c).Id, Subject: req.Subject, Status: "待处理", CreatedAt: now, UpdatedAt: now}
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.SupportTicket{}).Where("user_id=? AND status<>?", t.UserID, "已关闭").Count(&count).Error; err != nil {
			return err
		}
		if count >= 10 {
			return errors.New("未关闭工单已达到 10 个，请先处理已有工单")
		}
		if err := tx.Create(&t).Error; err != nil {
			return err
		}
		return tx.Create(&model.SupportMessage{TicketID: t.ID, Body: req.Body, FromAdmin: session.GetLoginUser(c).IsAdmin(), CreatedAt: now}).Error
	})
	jsonObj(c, t, err)
}

func readSupportTicket(c *gin.Context) {
	t, err := ownedTicket(c)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	rows := []model.SupportMessage{}
	err = database.GetDB().Where("ticket_id=?", t.ID).Order("id").Find(&rows).Error
	jsonObj(c, gin.H{"ticket": t, "messages": rows}, err)
}

func replySupportTicket(c *gin.Context) {
	var req struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" || len(req.Body) > 12000 {
		jsonObj(c, nil, errors.New("回复不能为空且不能超过 12000 字节"))
		return
	}
	supportMu.Lock()
	defer supportMu.Unlock()
	t, err := ownedTicket(c)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	if t.Status == "已关闭" {
		jsonObj(c, nil, errors.New("工单已关闭，请新建工单"))
		return
	}
	admin := session.GetLoginUser(c).IsAdmin()
	status := "待处理"
	if admin {
		status = "已回复"
	}
	now := time.Now().UnixMilli()
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&model.SupportMessage{TicketID: t.ID, Body: req.Body, FromAdmin: admin, CreatedAt: now}).Error; err != nil {
			return err
		}
		return tx.Model(&t).Updates(map[string]any{"status": status, "updated_at": now}).Error
	})
	jsonObj(c, nil, err)
}

func closeSupportTicket(c *gin.Context) {
	supportMu.Lock()
	defer supportMu.Unlock()
	t, err := ownedTicket(c)
	if err == nil {
		err = database.GetDB().Model(&t).Updates(map[string]any{"status": "已关闭", "updated_at": time.Now().UnixMilli()}).Error
	}
	jsonObj(c, nil, err)
}
