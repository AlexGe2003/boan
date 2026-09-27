package model

// SubscriptionPlan is a reusable service template. Applying it preserves each
// subscriber's credentials and measured traffic.
type SubscriptionPlan struct {
	ID           int    `json:"id" gorm:"primaryKey"`
	Name         string `json:"name" gorm:"uniqueIndex;not null"`
	Description  string `json:"description"`
	InboundIDs   string `json:"-" gorm:"type:text"`
	TotalGB      int64  `json:"totalGB"`
	DurationDays int    `json:"durationDays"`
	LimitIP      int    `json:"limitIp"`
	LimitHwid    int    `json:"limitHwid"`
	Enabled      bool   `json:"enabled"`
}
type SubscriptionAssignment struct {
	ClientID  int   `json:"clientId" gorm:"primaryKey"`
	PlanID    int   `json:"planId" gorm:"index"`
	AppliedAt int64 `json:"appliedAt"`
}
