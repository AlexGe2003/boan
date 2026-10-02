package model

// SubscriptionPlan is a reusable service template. Applying it preserves each
// subscriber's credentials and measured traffic.
type SubscriptionPlan struct {
	ID           int    `json:"id" gorm:"primaryKey"`
	Name         string `json:"name" gorm:"uniqueIndex;not null"`
	Description  string `json:"description"`
	InboundIDs   string `json:"-" gorm:"type:text"`
	NodeGroupIDs string `json:"-" gorm:"type:text;not null;default:'[]'"`
	Prices       string `json:"-" gorm:"type:text;not null;default:'[]'"`
	TotalGB      int64  `json:"totalGB"`
	DurationDays int    `json:"durationDays"`
	LimitIP      int    `json:"limitIp"`
	LimitHwid    int    `json:"limitHwid"`
	Enabled      bool   `json:"enabled"`
}

type PlanPrice struct {
	Period string `json:"period" example:"monthly"`
	Days   int    `json:"days" example:"30"`
	Amount int64  `json:"amount" example:"990"`
}

type NodeGroup struct {
	ID          int    `json:"id" gorm:"primaryKey"`
	Name        string `json:"name" gorm:"uniqueIndex;not null"`
	Description string `json:"description"`
	InboundIDs  string `json:"-" gorm:"type:text;not null"`
}

type ServiceOrder struct {
	ID           string `json:"id" gorm:"primaryKey;size:36"`
	UserID       int    `json:"userId" gorm:"index:idx_service_order_user_status,priority:1"`
	ClientID     int    `json:"-"`
	PlanID       int    `json:"planId" gorm:"index"`
	PlanName     string `json:"planName"`
	Period       string `json:"period"`
	DurationDays int    `json:"durationDays"`
	Amount       int64  `json:"amount"`
	Currency     string `json:"currency"`
	Kind         string `json:"kind"`
	Status       string `json:"status" gorm:"index:idx_service_order_user_status,priority:2"`
	Snapshot     string `json:"-" gorm:"type:text"`
	TargetExpiry int64  `json:"targetExpiry"`
	CreatedAt    int64  `json:"createdAt" gorm:"index"`
	ExpiresAt    int64  `json:"expiresAt"`
	PaidAt       int64  `json:"paidAt"`
	CompletedAt  int64  `json:"completedAt"`
	PaidBy       int    `json:"paidBy"`
	PaymentNote  string `json:"paymentNote"`
	LastError    string `json:"lastError"`
}
type SubscriptionAssignment struct {
	ClientID  int   `json:"clientId" gorm:"primaryKey"`
	PlanID    int   `json:"planId" gorm:"index"`
	AppliedAt int64 `json:"appliedAt"`
}
