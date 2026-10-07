package service

import (
	"fmt"
	"math"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func scaleQuotaBytes(bytes, rate, remainder int64) (int64, int64, error) {
	if bytes < 0 {
		bytes = 0
	}
	if rate < 1 || rate > 100000 || remainder < 0 || remainder >= 1000 {
		return 0, 0, fmt.Errorf("invalid quota scaling inputs")
	}
	whole, tail := bytes/1000, (bytes%1000)*rate+remainder
	if whole > (math.MaxInt64-tail/1000)/rate {
		return 0, 0, fmt.Errorf("quota traffic overflow")
	}
	return whole*rate + tail/1000, tail % 1000, nil
}

// Raw baselines move independently of quota renewal and frozen quota snapshots.
func remoteWireDelta(tx *gorm.DB, nodeID int, email string, raw xray.ClientTraffic, fallbackUp, fallbackDown int64, seed bool) (int64, int64, error) {
	if !raw.RawKnown {
		return fallbackUp, fallbackDown, nil
	}
	var base model.NodeClientTraffic
	err := tx.Where("node_id = ? AND email = ?", nodeID, email).Take(&base).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return 0, 0, err
	}
	up, down := max(raw.RawUp, 0), max(raw.RawDown, 0)
	if base.RawKnown {
		up = max(raw.RawUp-base.RawUp, 0)
		down = max(raw.RawDown-base.RawDown, 0)
	}
	if seed {
		up, down = 0, 0
	}
	err = tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "node_id"}, {Name: "email"}},
		DoUpdates: clause.AssignmentColumns([]string{"raw_up", "raw_down", "raw_known"}),
	}).Create(&model.NodeClientTraffic{NodeId: nodeID, Email: email, RawUp: max(raw.RawUp, base.RawUp, 0), RawDown: max(raw.RawDown, base.RawDown, 0), RawKnown: true}).Error
	return up, down, err
}
