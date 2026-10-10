package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func NewAnnouncementController(g *gin.RouterGroup) {
	g.GET("", listAnnouncements)
	g.POST("", createAnnouncement)
	g.PUT("/:id", updateAnnouncement)
	g.DELETE("/:id", deleteAnnouncement)
}

func listAnnouncements(c *gin.Context) {
	u := session.GetLoginUser(c)
	q := database.GetDB().Model(&model.Announcement{})
	if u == nil || !u.IsAdmin() || c.Query("all") != "1" {
		q = q.Where("enabled = ?", true)
	}
	var rows []model.Announcement
	err := q.Order("pinned DESC, id DESC").Limit(200).Find(&rows).Error
	jsonObj(c, rows, err)
}

type announcementReq struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Tag     string `json:"tag"`
	Popup   *bool  `json:"popup"`
	Pinned  *bool  `json:"pinned"`
	Enabled *bool  `json:"enabled"`
}

func createAnnouncement(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		pureJsonMsg(c, http.StatusForbidden, false, "无权限执行此操作")
		return
	}
	var req announcementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsgObj(c, "请求格式错误", nil, err)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)
	if req.Title == "" || req.Content == "" {
		jsonMsgObj(c, "标题与内容不能为空", nil, errors.New("title and content are required"))
		return
	}
	tag := strings.TrimSpace(req.Tag)
	if tag == "" {
		tag = "notice"
	}
	popup := true
	if req.Popup != nil {
		popup = *req.Popup
	}
	pinned := false
	if req.Pinned != nil {
		pinned = *req.Pinned
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	now := time.Now().UnixMilli()
	item := model.Announcement{
		Title:     req.Title,
		Content:   req.Content,
		Tag:       tag,
		Popup:     popup,
		Pinned:    pinned,
		Enabled:   enabled,
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := database.GetDB().Create(&item).Error
	jsonMsgObj(c, "公告发布成功", item, err)
}

func updateAnnouncement(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		pureJsonMsg(c, http.StatusForbidden, false, "无权限执行此操作")
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		jsonMsgObj(c, "无效的公告ID", nil, errors.New("invalid id"))
		return
	}
	var req announcementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsgObj(c, "请求格式错误", nil, err)
		return
	}
	var item model.Announcement
	if err := database.GetDB().First(&item, id).Error; err != nil {
		jsonMsgObj(c, "公告不存在", nil, err)
		return
	}
	if t := strings.TrimSpace(req.Title); t != "" {
		item.Title = t
	}
	if ct := strings.TrimSpace(req.Content); ct != "" {
		item.Content = ct
	}
	if tg := strings.TrimSpace(req.Tag); tg != "" {
		item.Tag = tg
	}
	if req.Popup != nil {
		item.Popup = *req.Popup
	}
	if req.Pinned != nil {
		item.Pinned = *req.Pinned
	}
	if req.Enabled != nil {
		item.Enabled = *req.Enabled
	}
	item.UpdatedAt = time.Now().UnixMilli()
	err = database.GetDB().Save(&item).Error
	jsonMsgObj(c, "公告更新成功", item, err)
}

func deleteAnnouncement(c *gin.Context) {
	u := session.GetLoginUser(c)
	if u == nil || !u.IsAdmin() {
		pureJsonMsg(c, http.StatusForbidden, false, "无权限执行此操作")
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		jsonMsgObj(c, "无效的公告ID", nil, errors.New("invalid id"))
		return
	}
	err = database.GetDB().Delete(&model.Announcement{}, id).Error
	jsonMsgObj(c, "公告已删除", nil, err)
}
