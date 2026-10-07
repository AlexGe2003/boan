package service

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

type activityPart struct {
	source ActivitySource
	data   ClientActivity
}

func (s *ClientService) FleetActivity(ctx context.Context, email string, hours int, scope string, nodeID int) (ClientActivity, error) {
	var nodes []model.Node
	q := database.GetDB().Where("enable = ?", true).
		Where("EXISTS (SELECT 1 FROM inbounds JOIN client_inbounds ON client_inbounds.inbound_id = inbounds.id JOIN clients ON clients.id = client_inbounds.client_id WHERE inbounds.node_id = nodes.id AND clients.email = ?)", email).Order("id")
	if nodeID >= 0 {
		q = q.Where("id = ?", nodeID)
	}
	if err := q.Find(&nodes).Error; err != nil {
		return ClientActivity{}, err
	}
	if nodeID > 0 && len(nodes) == 0 {
		return ClientActivity{}, errors.New("节点不存在或未启用")
	}
	parts := make([]activityPart, len(nodes)+1)
	if nodeID <= 0 {
		data, err := s.Activity(email, hours, scope)
		if err != nil {
			data.Status = "unavailable"
		}
		parts[0] = activityPart{ActivitySource{NodeID: 0, Name: "本机"}, data}
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i, node := range nodes {
		wg.Add(1)
		go func(i int, node model.Node) {
			defer wg.Done()
			part := activityPart{source: ActivitySource{NodeID: node.Id, Name: node.Name}, data: ClientActivity{Status: "unavailable"}}
			defer func() { parts[i+1] = part }()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			mgr := runtime.GetManager()
			if mgr == nil {
				return
			}
			remote, err := mgr.RemoteFor(&node)
			if err != nil {
				return
			}
			raw, err := remote.FetchClientActivity(ctx, email, hours, scope)
			if err != nil {
				return
			}
			var data ClientActivity
			if json.Unmarshal(raw, &data) != nil {
				return
			}
			part.data = data
		}(i, node)
	}
	wg.Wait()
	return mergeActivity(parts, hours, time.Now()), nil
}

func mergeActivity(parts []activityPart, hours int, now time.Time) ClientActivity {
	result, _ := readClientActivity("none", "", hours, now)
	result.Status = "unavailable"
	result.Sources = []ActivitySource{}
	result.Usage = mergeDestinationUsage(parts)
	destinations := map[string]ActivityDestination{}
	categories := map[string]int{}
	visits := []ActivityVisit{}
	recent := []ActivityVisit{}
	for _, part := range parts {
		if part.source.Name == "" {
			continue
		}
		data := part.data
		source := part.source
		source.Status, source.Connections, source.Sampled = data.Status, data.Connections, data.Sampled
		result.Sources = append(result.Sources, source)
		if data.Status != "ready" {
			continue
		}
		result.Status = "ready"
		result.Connections += data.Connections
		result.Sampled = result.Sampled || data.Sampled
		result.Demo = result.Demo || data.Demo
		for _, d := range data.Destinations {
			v := destinations[d.Host]
			v.Host, v.Category = d.Host, d.Category
			v.Count += d.Count
			v.LastSeen = max(v.LastSeen, d.LastSeen)
			destinations[d.Host] = v
		}
		for _, c := range data.Categories {
			categories[c.Name] += c.Count
		}
		for _, v := range data.Visits {
			v.NodeName = source.Name
			visits = append(visits, v)
		}
		for _, v := range data.Recent {
			v.NodeName = source.Name
			recent = append(recent, v)
		}
	}
	for _, d := range destinations {
		result.Destinations = append(result.Destinations, d)
	}
	sort.Slice(result.Destinations, func(i, j int) bool {
		a, b := result.Destinations[i], result.Destinations[j]
		if a.Count == b.Count {
			return a.Host < b.Host
		}
		return a.Count > b.Count
	})
	if len(result.Destinations) > 50 {
		result.Destinations = result.Destinations[:50]
		result.Sampled = true
	}
	for name, count := range categories {
		result.Categories = append(result.Categories, ActivityCategory{Name: name, Count: count})
	}
	sort.Slice(result.Categories, func(i, j int) bool { return result.Categories[i].Count > result.Categories[j].Count })
	sort.Slice(visits, func(i, j int) bool { return visits[i].Time > visits[j].Time })
	if len(visits) > 100 {
		visits = visits[:100]
	}
	result.Visits = visits
	sort.Slice(recent, func(i, j int) bool { return recent[i].Time > recent[j].Time })
	seen := map[string]bool{}
	for _, v := range recent {
		if !seen[v.Host] && len(result.Recent) < 30 {
			result.Recent = append(result.Recent, v)
			seen[v.Host] = true
		}
	}
	return result
}
