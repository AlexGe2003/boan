package service

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const OrderPending = "pending"
const OrderPaid = "paid"
const OrderFailed = "failed"
const OrderCompleted = "completed"
const OrderCancelled = "cancelled"
const OrderExpired = "expired"

type CommerceService struct{}

func (s *CommerceService) ExpireOrders() error {
	return database.GetDB().Model(&model.ServiceOrder{}).Where("status = ? AND expires_at <= ?", OrderPending, time.Now().UnixMilli()).Update("status", OrderExpired).Error
}

func (s *CommerceService) CreateOrder(user *model.User, plan model.SubscriptionPlan, price model.PlanPrice, snapshot string) (*model.ServiceOrder, error) {
	if user == nil || user.Role != model.RoleCustomer || user.ClientID == nil {
		return nil, errors.New("仅订阅用户可以购买套餐")
	}
	if err := s.ExpireOrders(); err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	order := model.ServiceOrder{ID: uuid.NewString(), UserID: user.Id, ClientID: *user.ClientID, PlanID: plan.ID, PlanName: plan.Name, Period: price.Period, DurationDays: price.Days, Amount: price.Amount, Currency: "CNY", Kind: "purchase", Status: OrderPending, Snapshot: snapshot, CreatedAt: now, ExpiresAt: now + int64(30*time.Minute/time.Millisecond)}
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var fresh model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&fresh, user.Id).Error; err != nil {
			return err
		}
		if fresh.Role != model.RoleCustomer || fresh.ClientID == nil || *fresh.ClientID != order.ClientID {
			return errors.New("账号关联已变更，请重新登录")
		}
		var rec model.ClientRecord
		if err := tx.First(&rec, order.ClientID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.ServiceOrder{}).Where("user_id = ? AND status IN ?", user.Id, []string{OrderPending, OrderPaid, OrderFailed}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return errors.New("您已有待处理订单，请先处理或取消该订单")
		}
		var assignment model.SubscriptionAssignment
		err := tx.First(&assignment, "client_id = ?", order.ClientID).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if assignment.PlanID == plan.ID {
			order.Kind = "renewal"
		}
		return tx.Create(&order).Error
	})
	return &order, err
}

func (s *CommerceService) CancelOrder(id string, user *model.User) error {
	q := database.GetDB().Model(&model.ServiceOrder{}).Where("id = ? AND status = ?", id, OrderPending)
	if !user.IsAdmin() {
		q = q.Where("user_id = ?", user.Id)
	}
	result := q.Update("status", OrderCancelled)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("订单不存在、无权访问或已无法取消")
	}
	return nil
}

func (s *CommerceService) ConfirmOrder(id string, admin *model.User, note string) (*model.ServiceOrder, error) {
	if admin == nil || !admin.IsAdmin() {
		return nil, errors.New("仅管理员可以确认收款")
	}
	var order model.ServiceOrder
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id).Error; err != nil {
			return err
		}
		if order.Status == OrderCompleted || order.Status == OrderPaid || order.Status == OrderFailed {
			return nil
		}
		if order.Status != OrderPending || order.ExpiresAt <= time.Now().UnixMilli() {
			return errors.New("订单已取消或过期，不能确认收款")
		}
		var user model.User
		if err := tx.First(&user, order.UserID).Error; err != nil {
			return err
		}
		if user.Role != model.RoleCustomer || user.ClientID == nil || *user.ClientID != order.ClientID {
			return errors.New("订单账号关联已失效")
		}
		var rec model.ClientRecord
		if err := tx.First(&rec, order.ClientID).Error; err != nil {
			return err
		}
		var assignment model.SubscriptionAssignment
		lookup := tx.First(&assignment, "client_id = ?", rec.Id).Error
		if lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return lookup
		}
		now := time.Now().UnixMilli()
		base := now
		order.Kind = "purchase"
		if assignment.PlanID == order.PlanID {
			order.Kind = "renewal"
			if order.DurationDays > 0 && rec.ExpiryTime == 0 {
				return errors.New("长期套餐无需按周期续期，请联系管理员调整服务")
			}
			if rec.ExpiryTime > base {
				base = rec.ExpiryTime
			}
		}
		order.TargetExpiry = 0
		if order.DurationDays > 0 {
			order.TargetExpiry = base + int64(order.DurationDays)*86400000
		}
		order.Status, order.PaidAt, order.PaidBy, order.PaymentNote = OrderPaid, now, admin.Id, note
		return tx.Save(&order).Error
	})
	return &order, err
}

func (s *CommerceService) FinishOrder(order *model.ServiceOrder, applyErr error) error {
	status, lastError, completedAt := OrderCompleted, "", time.Now().UnixMilli()
	if applyErr != nil {
		status, lastError, completedAt = OrderFailed, applyErr.Error(), 0
	}
	return database.GetDB().Model(&model.ServiceOrder{}).Where("id = ? AND status IN ?", order.ID, []string{OrderPaid, OrderFailed}).Updates(map[string]any{"status": status, "last_error": lastError, "completed_at": completedAt}).Error
}

type StorePlan struct {
	ID          int               `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	TotalGB     int64             `json:"totalGB"`
	NodeCount   int               `json:"nodeCount"`
	LimitIP     int               `json:"limitIp"`
	LimitHwid   int               `json:"limitHwid"`
	Prices      []model.PlanPrice `json:"prices"`
}

func PlanPrices(raw string) ([]model.PlanPrice, error) {
	prices := []model.PlanPrice{}
	if raw == "" {
		return prices, nil
	}
	if err := json.Unmarshal([]byte(raw), &prices); err != nil {
		return nil, err
	}
	if prices == nil {
		prices = []model.PlanPrice{}
	}
	return prices, ValidatePlanPrices(prices)
}

type OrderPage struct {
	Items []model.ServiceOrder `json:"items"`
	Total int64                `json:"total"`
	Page  int                  `json:"page"`
}
