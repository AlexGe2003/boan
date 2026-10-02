package service

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

func DecodePlanIDs(raw string) ([]int, error) {
	ids := []int{}
	if raw == "" {
		return ids, nil
	}
	err := json.Unmarshal([]byte(raw), &ids)
	if ids == nil {
		ids = []int{}
	}
	return ids, err
}

func ValidateInboundIDs(db *gorm.DB, ids []int) ([]int, error) {
	if len(ids) == 0 || len(ids) > 500 {
		return nil, errors.New("请选择 1 至 500 个节点入站")
	}
	unique := slices.Clone(ids)
	slices.Sort(unique)
	unique = slices.Compact(unique)
	if unique[0] <= 0 {
		return nil, errors.New("无效的节点入站")
	}
	var count int64
	if err := db.Model(&model.Inbound{}).Where("id IN ?", unique).Count(&count).Error; err != nil {
		return nil, err
	}
	if count != int64(len(unique)) {
		return nil, errors.New("有节点入站已被删除，请重新选择")
	}
	return unique, nil
}

func ResolvePlanInbounds(db *gorm.DB, direct, groups []int) ([]int, error) {
	if len(groups) > 100 {
		return nil, errors.New("节点分组不能超过 100 个")
	}
	ids := slices.Clone(direct)
	groupIDs := slices.Clone(groups)
	slices.Sort(groupIDs)
	groupIDs = slices.Compact(groupIDs)
	if len(groupIDs) > 0 {
		if groupIDs[0] <= 0 {
			return nil, errors.New("无效的节点分组")
		}
		var rows []model.NodeGroup
		if err := db.Where("id IN ?", groupIDs).Find(&rows).Error; err != nil {
			return nil, err
		}
		if len(rows) != len(groupIDs) {
			return nil, errors.New("节点分组不存在，请重新选择")
		}
		for _, group := range rows {
			members, err := DecodePlanIDs(group.InboundIDs)
			if err != nil {
				return nil, err
			}
			ids = append(ids, members...)
		}
	}
	// Bound the union, rather than rejecting overlap between groups.
	slices.Sort(ids)
	return ValidateInboundIDs(db, slices.Compact(ids))
}

func ValidatePlanPrices(prices []model.PlanPrice) error {
	periods := map[string]int{"monthly": 30, "quarterly": 90, "half_yearly": 180, "yearly": 365, "two_yearly": 730, "three_yearly": 1095, "onetime": 0}
	seen := map[string]bool{}
	if len(prices) > len(periods) {
		return errors.New("价格周期数量无效")
	}
	for _, price := range prices {
		days, ok := periods[price.Period]
		if !ok || seen[price.Period] || days != price.Days || price.Amount <= 0 || price.Amount > 100000000 {
			return errors.New("套餐周期或价格无效，金额应为 1 至 100000000 分")
		}
		seen[price.Period] = true
	}
	return nil
}

func ValidateResourceName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 120 {
		return "", errors.New("名称不能为空且不能超过 120 字节")
	}
	return name, nil
}

type SubscriptionPlanView struct {
	model.SubscriptionPlan
	InboundIDs   []int             `json:"inboundIds"`
	NodeGroupIDs []int             `json:"nodeGroupIds"`
	Prices       []model.PlanPrice `json:"prices"`
}

type NodeGroupView struct {
	model.NodeGroup
	InboundIDs []int `json:"inboundIds"`
	PlanCount  int   `json:"planCount"`
}
