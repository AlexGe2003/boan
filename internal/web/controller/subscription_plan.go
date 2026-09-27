package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/crypto"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var planMutationMu sync.Mutex

type SubscriptionPlanController struct {
	clients  service.ClientService
	inbounds service.InboundService
	xray     service.XrayService
}
type planInput struct {
	model.SubscriptionPlan
	InboundIDs []int `json:"inboundIds"`
}

func NewSubscriptionPlanController(g *gin.RouterGroup) {
	a := &SubscriptionPlanController{}
	g.Use(func(c *gin.Context) {
		u := session.GetLoginUser(c)
		if u == nil || !u.IsAdmin() {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	})
	g.GET("", a.list)
	g.GET("/assignments", a.assignments)
	g.POST("/save", a.save)
	g.POST("/delete", a.delete)
	g.POST("/subscribe", a.subscribe)
	g.POST("/apply", a.apply)
}
func (a *SubscriptionPlanController) list(c *gin.Context) {
	var rows []model.SubscriptionPlan
	if err := database.GetDB().Order("id DESC").Find(&rows).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	result := make([]planInput, 0, len(rows))
	for _, r := range rows {
		var ids []int
		if err := json.Unmarshal([]byte(r.InboundIDs), &ids); err != nil {
			jsonObj(c, nil, err)
			return
		}
		result = append(result, planInput{r, ids})
	}
	jsonObj(c, result, nil)
}
func validatePlan(p *planInput) error {
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" || len(p.Name) > 120 {
		return errors.New("套餐名称不能为空且不能超过 120 字节")
	}
	if p.TotalGB < 0 || p.TotalGB > 1<<60 || p.DurationDays < 0 || p.DurationDays > 36500 || p.LimitIP < 0 || p.LimitHwid < 0 {
		return errors.New("套餐额度或限制无效")
	}
	if len(p.InboundIDs) == 0 || len(p.InboundIDs) > 500 {
		return errors.New("请选择 1 至 500 个节点入站")
	}
	seen := map[int]bool{}
	ids := []int{}
	for _, id := range p.InboundIDs {
		if id <= 0 {
			return errors.New("无效的节点入站")
		}
		if !seen[id] {
			ids = append(ids, id)
			seen[id] = true
		}
	}
	var count int64
	if err := database.GetDB().Model(&model.Inbound{}).Where("id IN ?", ids).Count(&count).Error; err != nil {
		return err
	}
	if count != int64(len(ids)) {
		return errors.New("套餐中有节点入站已被删除，请重新选择")
	}
	p.InboundIDs = ids
	b, _ := json.Marshal(ids)
	p.SubscriptionPlan.InboundIDs = string(b)
	return nil
}
func (a *SubscriptionPlanController) save(c *gin.Context) {
	var p planInput
	if err := c.ShouldBindJSON(&p); err != nil {
		jsonObj(c, nil, err)
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	if err := validatePlan(&p); err != nil {
		jsonObj(c, nil, err)
		return
	}
	db := database.GetDB()
	var err error
	if p.ID == 0 {
		err = db.Create(&p.SubscriptionPlan).Error
	} else {
		var existing model.SubscriptionPlan
		err = db.First(&existing, p.ID).Error
		if err == nil {
			err = db.Model(&existing).Select("Name", "Description", "InboundIDs", "TotalGB", "DurationDays", "LimitIP", "LimitHwid", "Enabled").Updates(&p.SubscriptionPlan).Error
		}
	}
	jsonObj(c, p, err)
}
func (a *SubscriptionPlanController) delete(c *gin.Context) {
	var req struct {
		ID int `json:"id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ID <= 0 {
		jsonObj(c, nil, errors.New("无效的套餐"))
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.SubscriptionAssignment{}).Where("plan_id = ? AND client_id IN (?)", req.ID, tx.Model(&model.ClientRecord{}).Select("id")).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return errors.New("套餐仍有用户使用，请停用套餐或先给用户更换套餐")
		}
		return tx.Delete(&model.SubscriptionPlan{}, req.ID).Error
	})
	jsonObj(c, nil, err)
}
func loadPlan(id int) (planInput, error) {
	var p planInput
	if id <= 0 {
		return p, errors.New("请选择套餐")
	}
	if err := database.GetDB().First(&p.SubscriptionPlan, id).Error; err != nil {
		return p, err
	}
	if !p.Enabled {
		return p, errors.New("该套餐已停用")
	}
	if err := json.Unmarshal([]byte(p.SubscriptionPlan.InboundIDs), &p.InboundIDs); err != nil {
		return p, err
	}
	return p, validatePlan(&p)
}

// Remote node updates cannot share a database transaction. Keep the account on
// partial failure and report its identity so an administrator can retry applying
// the plan without creating another account or changing its subscription URL.
func (a *SubscriptionPlanController) subscribe(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		PlanID   int    `json:"planId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Username) > 120 || strings.IndexFunc(req.Username, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || r == '/' || r == '\\' }) >= 0 || len(req.Password) < 8 || len(req.Password) > 72 {
		jsonObj(c, nil, errors.New("账号不能包含空格或斜线；密码需为 8–72 字节"))
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	var p planInput
	if req.PlanID != 0 {
		var err error
		p, err = loadPlan(req.PlanID)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
	}
	hash, err := crypto.HashPasswordAsBcrypt(req.Password)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	rec := model.ClientRecord{Email: req.Username, SubID: uuid.NewString(), UUID: uuid.NewString(), Enable: true, TrafficReset: "never", TrafficResetDay: 1}
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&rec).Error; err != nil {
			return errors.New("该用户标识已存在，请在原用户上开通账号或分配套餐")
		}
		u := model.User{Username: req.Username, Password: hash, Role: model.RoleCustomer, ClientID: &rec.Id}
		if err := tx.Create(&u).Error; err != nil {
			return errors.New("该登录账号已存在")
		}
		return nil
	})
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	if req.PlanID != 0 {
		err = a.applyOne(rec.Email, p)
	}
	if err != nil {
		err = fmt.Errorf("账号已创建，但套餐配置未完成；请在用户管理中选中 %s 后重新分配套餐：%w", rec.Email, err)
	}
	notifyClientsChanged()
	jsonObj(c, gin.H{"email": rec.Email, "created": true}, err)
}
func (a *SubscriptionPlanController) applyOne(email string, p planInput) error {
	rec, err := a.clients.GetRecordByEmail(nil, email)
	if err != nil {
		return err
	}
	oldIDs, err := a.clients.GetInboundIdsForRecord(rec.Id)
	if err != nil {
		return err
	}
	client := rec.ToClient()
	client.TotalGB = p.TotalGB
	client.LimitIP = p.LimitIP
	// Reapplying the same plan is a configuration sync, not a renewal.
	var assignment model.SubscriptionAssignment
	lookup := database.GetDB().First(&assignment, "client_id = ?", rec.Id).Error
	if lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound) {
		return lookup
	}
	if assignment.PlanID != p.ID {
		client.ExpiryTime = 0
		if p.DurationDays > 0 {
			client.ExpiryTime = time.Now().Add(time.Duration(p.DurationDays) * 24 * time.Hour).UnixMilli()
		}
	}
	need, err := a.clients.UpdateByEmail(&a.inbounds, email, *client, p.LimitHwid)
	if need {
		a.xray.SetToNeedRestart()
	}
	if err != nil {
		return err
	}
	// Create reuses this identity's credentials and fills protocol-specific defaults.
	payload := service.ClientCreatePayload{Client: *client, InboundIds: p.InboundIDs, LimitHwid: p.LimitHwid}
	need, err = a.clients.Create(&a.inbounds, &payload)
	if need {
		a.xray.SetToNeedRestart()
	}
	if err != nil {
		return err
	}
	wanted := map[int]bool{}
	for _, id := range p.InboundIDs {
		wanted[id] = true
	}
	var remove []int
	for _, id := range oldIDs {
		if !wanted[id] {
			remove = append(remove, id)
		}
	}
	if len(remove) > 0 {
		need, err = a.clients.DetachByEmailMany(&a.inbounds, email, remove)
		if need {
			a.xray.SetToNeedRestart()
		}
		if err != nil {
			return err
		}
	}
	assignment = model.SubscriptionAssignment{ClientID: rec.Id, PlanID: p.ID, AppliedAt: time.Now().UnixMilli()}
	return database.GetDB().Clauses(clause.OnConflict{UpdateAll: true}).Create(&assignment).Error
}
func (a *SubscriptionPlanController) apply(c *gin.Context) {
	var req struct {
		PlanID int      `json:"planId"`
		Emails []string `json:"emails"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Emails) == 0 || len(req.Emails) > 500 {
		jsonObj(c, nil, errors.New("请选择 1 至 500 个用户"))
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	p, err := loadPlan(req.PlanID)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	var failures []string
	success := 0
	seen := map[string]bool{}
	for _, email := range req.Emails {
		if seen[email] {
			continue
		}
		seen[email] = true
		if err := a.applyOne(email, p); err != nil {
			failures = append(failures, email+": "+err.Error())
		} else {
			success++
		}
	}
	notifyClientsChanged()
	if len(failures) > 0 {
		err = fmt.Errorf("成功 %d 个，失败 %d 个：%s", success, len(failures), strings.Join(failures, "；"))
	}
	jsonObj(c, gin.H{"succeeded": success, "failures": failures}, err)
}

func (a *SubscriptionPlanController) assignments(c *gin.Context) {
	var rows []struct {
		Email  string `json:"email"`
		PlanID int    `json:"planId"`
		Name   string `json:"name"`
	}
	err := database.GetDB().Table("subscription_assignments AS a").Select("c.email, a.plan_id, p.name").Joins("JOIN clients c ON c.id = a.client_id").Joins("JOIN subscription_plans p ON p.id = a.plan_id").Scan(&rows).Error
	jsonObj(c, rows, err)
}
