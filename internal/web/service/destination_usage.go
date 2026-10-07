package service

import (
	"encoding/json"
	"io"
	"os"
	"sort"
	"time"
)

type DestinationUsageRow struct {
	Host     string `json:"host"`
	Category string `json:"category"`
	Up       int64  `json:"up"`
	Down     int64  `json:"down"`
	LastSeen int64  `json:"lastSeen"`
}
type DestinationUsage struct {
	Status    string                `json:"status"`
	Since     int64                 `json:"since"`
	UpdatedAt int64                 `json:"updatedAt"`
	Overflow  bool                  `json:"overflow"`
	Partial   bool                  `json:"partial"`
	Up        int64                 `json:"up"`
	Down      int64                 `json:"down"`
	Rows      []DestinationUsageRow `json:"rows"`
}

func readDestinationUsage(path, email string, now time.Time) *DestinationUsage {
	result := &DestinationUsage{Status: "unavailable", Rows: []DestinationUsageRow{}}
	if path == "" {
		result.Status = "disabled"
		return result
	}
	f, err := os.Open(path)
	if err != nil {
		return result
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, (16<<20)+1))
	if err != nil || len(raw) > 16<<20 {
		return result
	}
	var data struct {
		Version   int   `json:"version"`
		Since     int64 `json:"since"`
		UpdatedAt int64 `json:"updatedAt"`
		Overflow  bool  `json:"overflow"`
		Rows      []struct {
			Email    string `json:"email"`
			Host     string `json:"host"`
			Up       int64  `json:"up"`
			Down     int64  `json:"down"`
			LastSeen int64  `json:"lastSeen"`
		} `json:"rows"`
	}
	if json.Unmarshal(raw, &data) != nil || data.Version != 1 {
		return result
	}
	result.Status = "ready"
	result.Since = data.Since
	result.UpdatedAt = data.UpdatedAt
	result.Overflow = data.Overflow
	if data.UpdatedAt < now.Add(-30*time.Second).UnixMilli() {
		result.Status = "stale"
	}
	for _, r := range data.Rows {
		if r.Email != email || r.Up < 0 || r.Down < 0 {
			continue
		}
		host := activityHost(r.Host)
		category := activityCategory(host)
		if r.Host == "__other__" {
			host = "其他目标（容量限制）"
			category = "未细分"
		}
		if host == "" {
			result.Partial = true
			continue
		}
		result.Rows = append(result.Rows, DestinationUsageRow{host, category, r.Up, r.Down, r.LastSeen})
		result.Up += r.Up
		result.Down += r.Down
	}
	sortUsageRows(result)
	return result
}
func sortUsageRows(u *DestinationUsage) {
	sort.Slice(u.Rows, func(i, j int) bool {
		a, b := u.Rows[i], u.Rows[j]
		if a.Up+a.Down == b.Up+b.Down {
			return a.Host < b.Host
		}
		return a.Up+a.Down > b.Up+b.Down
	})
}
func mergeDestinationUsage(parts []activityPart) *DestinationUsage {
	result := &DestinationUsage{Status: "unavailable", Rows: []DestinationUsageRow{}}
	rows := map[string]DestinationUsageRow{}
	for _, p := range parts {
		if p.source.Name == "" {
			continue
		}
		u := p.data.Usage
		if u == nil || (u.Status != "ready" && u.Status != "stale") {
			result.Partial = true
			continue
		}
		result.Status = "ready"
		result.Partial = result.Partial || u.Partial || u.Status == "stale"
		result.Overflow = result.Overflow || u.Overflow
		if result.Since == 0 || u.Since < result.Since {
			result.Since = u.Since
		}
		if result.UpdatedAt == 0 || u.UpdatedAt < result.UpdatedAt {
			result.UpdatedAt = u.UpdatedAt
		}
		result.Up += u.Up
		result.Down += u.Down
		for _, r := range u.Rows {
			v := rows[r.Host]
			v.Host = r.Host
			v.Category = r.Category
			v.Up += r.Up
			v.Down += r.Down
			v.LastSeen = max(v.LastSeen, r.LastSeen)
			rows[r.Host] = v
		}
	}
	for _, r := range rows {
		result.Rows = append(result.Rows, r)
	}
	sortUsageRows(result)
	return result
}
