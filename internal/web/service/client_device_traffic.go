package service

import (
	"github.com/mhsanaei/3x-ui/v3/internal/database"
)

// Direction is from the user's perspective: Up is user -> node,
// Down is node -> user. These are observed bytes, independent of quota resets.
type ClientNodeTraffic struct {
	NodeID    int    `json:"nodeId"`
	NodeName  string `json:"nodeName"`
	Up        int64  `json:"up"`
	Down      int64  `json:"down"`
	Total     int64  `json:"total" gorm:"-"`
	StartedAt int64  `json:"startedAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type ClientTrafficReport struct {
	Recorded  bool                `json:"recorded"`
	Up        int64               `json:"up"`
	Down      int64               `json:"down"`
	Total     int64               `json:"total"`
	StartedAt int64               `json:"startedAt"`
	UpdatedAt int64               `json:"updatedAt"`
	Nodes     []ClientNodeTraffic `json:"nodes"`
}

func (s *ClientService) DeviceTraffic(email string) (ClientTrafficReport, error) {
	r := ClientTrafficReport{Nodes: []ClientNodeTraffic{}}
	// Do not add global/quota snapshots: they already include these node deltas.
	// A LEFT JOIN retains historical usage when a node has been removed.
	err := database.GetDB().Table("server_client_usages AS u").
		Joins("LEFT JOIN nodes AS n ON n.id = u.node_id").
		Where("u.email = ?", email).
		Select("u.node_id, COALESCE(n.name, '') AS node_name, u.up, u.down, u.started_at, u.updated_at").
		Order("u.node_id").Scan(&r.Nodes).Error
	if err != nil {
		return r, err
	}
	r.Recorded = len(r.Nodes) > 0
	add := func(a, b int64) int64 { return a + min(max(b, 0), database.TrafficMax-a) }
	for i := range r.Nodes {
		row := &r.Nodes[i]
		row.Up, row.Down = add(0, row.Up), add(0, row.Down)
		row.Total = add(row.Up, row.Down)
		r.Up, r.Down = add(r.Up, row.Up), add(r.Down, row.Down)
		if row.StartedAt > 0 && (r.StartedAt == 0 || row.StartedAt < r.StartedAt) {
			r.StartedAt = row.StartedAt
		}
		r.UpdatedAt = max(r.UpdatedAt, row.UpdatedAt)
	}
	r.Total = add(r.Up, r.Down)
	return r, nil
}
