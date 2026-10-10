package service

import (
	"errors"
	"net/netip"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

type SubscriptionClientInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	UserAgent string `json:"userAgent"`
	LastSeen  int64  `json:"lastSeen"`
	LastIP    string `json:"lastIp"`
}

var subscriptionClientPatterns = []struct {
	name string
	re   *regexp.Regexp
}{
	{"Shadowrocket", regexp.MustCompile(`(?i)(?:^|\s)shadowrocket(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"Clash Verge", regexp.MustCompile(`(?i)(?:^|\s)clash[- ]verge(?:[- ]rev)?(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"Clash Party", regexp.MustCompile(`(?i)(?:^|\s)clash[- ]party(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"Happ", regexp.MustCompile(`(?i)(?:^|\s)happ(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"Hiddify", regexp.MustCompile(`(?i)(?:^|\s)hiddify(?:next)?(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"v2rayN", regexp.MustCompile(`(?i)(?:^|\s)v2rayn(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"v2rayNG", regexp.MustCompile(`(?i)(?:^|\s)v2rayng(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"Clash/Mihomo", regexp.MustCompile(`(?i)(?:^|\s)(?:mihomo|clash(?:\.meta|[ -]meta)?)(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
	{"sing-box", regexp.MustCompile(`(?i)(?:^|\s)sing-box(?:/|\s+)?(?:v?([0-9][0-9A-Za-z.+_-]*))?(?:\s|$|[;(])`)},
}

// Names describe a reported subscription requester, never a live tunnel client.
func IdentifySubscriptionClient(userAgent string) (name, version string) {
	for _, pattern := range subscriptionClientPatterns {
		if match := pattern.re.FindStringSubmatch(trimHwidMeta(userAgent)); match != nil {
			return pattern.name, match[1]
		}
	}
	return "", ""
}

func (s *ClientService) RecordSubscriptionClient(subID string, req HwidRequest) error {
	subID = strings.TrimSpace(subID)
	if subID == "" {
		return nil
	}
	req = normalizeHwidRequest(req)
	if ip, err := netip.ParseAddr(req.SourceIP); err == nil && (ip.Unmap().IsLoopback() || ip.IsUnspecified()) {
		return nil
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var clients []model.ClientRecord
		if err := tx.Select("id").Where("sub_id = ? AND enable = ?", subID, true).Find(&clients).Error; err != nil {
			return err
		}
		if len(clients) == 0 {
			return nil
		}
		now := time.Now().UnixMilli()
		rows := make([]model.ClientSubscriptionFetch, len(clients))
		for i, client := range clients {
			rows[i] = model.ClientSubscriptionFetch{ClientID: client.Id, LastSeen: now, UserAgent: req.UserAgent, LastIP: req.SourceIP}
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "client_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"last_seen", "user_agent", "last_ip"}),
		}).CreateInBatches(rows, 200).Error
	})
}

func (s *ClientService) subscriptionClient(clientID int) (*SubscriptionClientInfo, error) {
	var row model.ClientSubscriptionFetch
	if err := database.GetDB().First(&row, "client_id = ?", clientID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if ip, err := netip.ParseAddr(row.LastIP); err == nil && (ip.Unmap().IsLoopback() || ip.IsUnspecified()) {
		return nil, nil
	}
	name, version := IdentifySubscriptionClient(row.UserAgent)
	return &SubscriptionClientInfo{Name: name, Version: version, UserAgent: row.UserAgent, LastSeen: row.LastSeen, LastIP: MaskDeviceIP(row.LastIP)}, nil
}
