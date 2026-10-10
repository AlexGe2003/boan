package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func NewCommerceController(g *gin.RouterGroup) {
	g.Use(func(c *gin.Context) {
		user := session.GetLoginUser(c)
		if user == nil || (!user.IsAdmin() && user.Role != model.RoleCustomer) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	})
	g.GET("/plans", storePlans)
	g.GET("/orders", listOrders)
	g.POST("/orders", createOrder)
	g.POST("/orders/:id/cancel", cancelOrder)
	g.POST("/orders/:id/confirm", requireAdmin, confirmOrder)
}

func storePlans(c *gin.Context) {
	var plans []model.SubscriptionPlan
	if err := database.GetDB().Where("enabled = ?", true).Order("id DESC").Find(&plans).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	result := []service.StorePlan{}
	for _, plan := range plans {
		prices, err := service.PlanPrices(plan.Prices)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		if len(prices) == 0 {
			continue
		}
		direct, err := service.DecodePlanIDs(plan.InboundIDs)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		groups, err := service.DecodePlanIDs(plan.NodeGroupIDs)
		if err != nil {
			jsonObj(c, nil, err)
			return
		}
		ids, err := service.ResolvePlanInbounds(database.GetDB(), direct, groups)
		if err != nil {
			continue
		}
		result = append(result, service.StorePlan{ID: plan.ID, Name: plan.Name, Description: plan.Description, TotalGB: plan.TotalGB, NodeCount: len(ids), LimitIP: plan.LimitIP, LimitHwid: plan.LimitHwid, Prices: prices})
	}
	jsonObj(c, result, nil)
}

func listOrders(c *gin.Context) {
	if err := (&service.CommerceService{}).ExpireOrders(); err != nil {
		jsonObj(c, nil, err)
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 || page > 100000 {
		jsonObj(c, nil, errors.New("页码无效"))
		return
	}
	q := database.GetDB().Model(&model.ServiceOrder{})
	user := session.GetLoginUser(c)
	if !user.IsAdmin() {
		q = q.Where("user_id = ?", user.Id)
	}
	status := c.Query("status")
	if status != "" {
		switch status {
		case service.OrderPending, service.OrderPaid, service.OrderFailed, service.OrderCompleted, service.OrderCancelled, service.OrderExpired:
		default:
			jsonObj(c, nil, errors.New("订单状态无效"))
			return
		}
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	rows := []model.ServiceOrder{}
	err := q.Order("created_at DESC, id DESC").Limit(50).Offset((page - 1) * 50).Find(&rows).Error
	if !user.IsAdmin() {
		for i := range rows {
			rows[i].PaymentNote = ""
			rows[i].PaidBy = 0
			if rows[i].LastError != "" {
				rows[i].LastError = "配置下发失败，请通过工单联系管理员"
			}
		}
	}
	jsonObj(c, service.OrderPage{Items: rows, Total: total, Page: page}, err)
}

func createOrder(c *gin.Context) {
	var req struct {
		PlanID int    `json:"planId"`
		Period string `json:"period"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	p, err := loadPlan(req.PlanID)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	var selected *model.PlanPrice
	for _, price := range p.Prices {
		if price.Period == req.Period {
			selected = &price
			break
		}
	}
	if selected == nil {
		jsonObj(c, nil, errors.New("请选择可购买的套餐周期"))
		return
	}
	// An order keeps its quoted configuration even if the catalogue changes.
	p.NodeGroupIDs = []int{}
	p.DurationDays = selected.Days
	snapshot, err := json.Marshal(p)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	order, err := (&service.CommerceService{}).CreateOrder(session.GetLoginUser(c), p.SubscriptionPlan, *selected, string(snapshot))
	jsonObj(c, order, err)
}

func cancelOrder(c *gin.Context) {
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	err := (&service.CommerceService{}).CancelOrder(c.Param("id"), session.GetLoginUser(c))
	jsonObj(c, nil, err)
}

func confirmOrder(c *gin.Context) {
	var req struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonObj(c, nil, err)
		return
	}
	req.Note = strings.TrimSpace(req.Note)
	if req.Note == "" || len(req.Note) > 1000 {
		jsonObj(c, nil, errors.New("请填写收款凭证或确认备注（最多 1000 字节）"))
		return
	}
	planMutationMu.Lock()
	defer planMutationMu.Unlock()
	svc := service.CommerceService{}
	order, err := svc.ConfirmOrder(c.Param("id"), session.GetLoginUser(c), req.Note)
	if err != nil {
		jsonObj(c, nil, err)
		return
	}
	if order.Status == service.OrderCompleted {
		jsonObj(c, order, nil)
		return
	}
	var p planInput
	applyErr := json.Unmarshal([]byte(order.Snapshot), &p)
	if applyErr == nil {
		var user model.User
		applyErr = database.GetDB().First(&user, order.UserID).Error
		if applyErr == nil && (user.Role != model.RoleCustomer || user.ClientID == nil || *user.ClientID != order.ClientID) {
			applyErr = errors.New("订单账号关联已失效")
		}
	}
	if applyErr == nil {
		_, applyErr = service.ValidateInboundIDs(database.GetDB(), p.InboundIDs)
	}
	if applyErr == nil {
		var rec model.ClientRecord
		applyErr = database.GetDB().First(&rec, order.ClientID).Error
		if applyErr == nil {
			applyErr = (&SubscriptionPlanController{}).applyWithExpiry(rec.Email, p, &order.TargetExpiry)
		}
	}
	if err := svc.FinishOrder(order, applyErr); err != nil {
		jsonObj(c, nil, err)
		return
	}
	notifyClientsChanged()
	if err := database.GetDB().First(order, "id = ?", order.ID).Error; err != nil {
		jsonObj(c, nil, err)
		return
	}
	jsonObj(c, order, applyErr)
}
