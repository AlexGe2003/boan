package service

import (
	"context"
	"encoding/json"
	"net/netip"
	"sort"
	"sync"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

type ClientConnection struct {
	IP       string `json:"ip"`
	LastSeen int64  `json:"lastSeen"`
	NodeID   int    `json:"nodeId"`
	NodeName string `json:"nodeName"`
}

type ClientConnectionSource struct {
	NodeID int    `json:"nodeId"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type ClientConnectionReport struct {
	Status            string                   `json:"status"`
	GeneratedAt       int64                    `json:"generatedAt"`
	OnlineSourceCount int                      `json:"onlineSourceCount"`
	Connections       []ClientConnection       `json:"connections"`
	Sources           []ClientConnectionSource `json:"sources"`
}

type ClientDeviceReport struct {
	Devices     []ClientHwidInfo       `json:"devices"`
	Registered  int                    `json:"registered"`
	Limit       int                    `json:"limit"`
	Connections ClientConnectionReport `json:"connections"`
	Traffic     ClientTrafficReport    `json:"traffic"`
}

func emptyClientConnections(now time.Time) ClientConnectionReport {
	return ClientConnectionReport{Status: "unavailable", GeneratedAt: now.UnixMilli(), Connections: []ClientConnection{}, Sources: []ClientConnectionSource{}}
}

// Online source addresses cannot be matched to HWIDs: NAT may share an address,
// and a subscription fetch does not prove that the device is connected.
func clientConnectionsFromUsers(email string, users []xray.OnlineUser, now time.Time) ClientConnectionReport {
	r := emptyClientConnections(now)
	r.Status = "ready"
	seen := map[string]int64{}
	for _, user := range users {
		if user.Email != email {
			continue
		}
		for _, entry := range user.IPs {
			ip, err := netip.ParseAddr(entry.IP)
			if err != nil || ip.IsLoopback() || ip.IsUnspecified() {
				continue
			}
			key := ip.Unmap().String()
			seen[key] = max(seen[key], entry.LastSeen)
		}
	}
	for ip, lastSeen := range seen {
		r.Connections = append(r.Connections, ClientConnection{IP: ip, LastSeen: lastSeen * 1000, NodeName: "本机"})
	}
	sortClientConnections(r.Connections)
	r.OnlineSourceCount = len(r.Connections)
	return r
}

func (s *ClientService) LocalClientConnections(email string) ClientConnectionReport {
	users, supported, err := (&XrayService{}).GetOnlineUsers()
	if err != nil || !supported {
		return emptyClientConnections(time.Now())
	}
	return clientConnectionsFromUsers(email, users, time.Now())
}

type clientConnectionPart struct {
	source ClientConnectionSource
	data   ClientConnectionReport
}

func (s *ClientService) FleetClientConnections(ctx context.Context, email string) (ClientConnectionReport, error) {
	db := database.GetDB()
	var nodes []model.Node
	if err := db.Where("enable = ?", true).
		Where("EXISTS (SELECT 1 FROM inbounds JOIN client_inbounds ON client_inbounds.inbound_id = inbounds.id JOIN clients ON clients.id = client_inbounds.client_id WHERE inbounds.node_id = nodes.id AND clients.email = ?)", email).
		Order("id").Find(&nodes).Error; err != nil {
		return ClientConnectionReport{}, err
	}
	var local int64
	if err := db.Model(&model.Inbound{}).
		Joins("JOIN client_inbounds ON client_inbounds.inbound_id = inbounds.id JOIN clients ON clients.id = client_inbounds.client_id").
		Where("inbounds.node_id IS NULL AND clients.email = ?", email).Count(&local).Error; err != nil {
		return ClientConnectionReport{}, err
	}
	parts := make([]clientConnectionPart, len(nodes)+1)
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i, node := range nodes {
		wg.Add(1)
		go func(i int, node model.Node) {
			defer wg.Done()
			part := clientConnectionPart{source: ClientConnectionSource{NodeID: node.Id, Name: node.Name}, data: emptyClientConnections(time.Now())}
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
			raw, err := remote.FetchClientConnections(ctx, email)
			if err != nil {
				return
			}
			var data ClientConnectionReport
			if json.Unmarshal(raw, &data) == nil {
				part.data = data
			}
		}(i, node)
	}
	if local > 0 {
		parts[0] = clientConnectionPart{source: ClientConnectionSource{Name: "本机"}, data: s.LocalClientConnections(email)}
	}
	wg.Wait()
	return mergeClientConnections(parts, time.Now()), nil
}

func mergeClientConnections(parts []clientConnectionPart, now time.Time) ClientConnectionReport {
	r := emptyClientConnections(now)
	seen := map[string]bool{}
	ready := 0
	for _, part := range parts {
		if part.source.Name == "" {
			continue
		}
		source := part.source
		source.Status = "unavailable"
		if part.data.Status == "ready" {
			source.Status = "ready"
			ready++
			ips := map[string]bool{}
			for _, entry := range part.data.Connections {
				ip, err := netip.ParseAddr(entry.IP)
				if err != nil || ip.IsLoopback() || ip.IsUnspecified() {
					continue
				}
				entry.IP = ip.Unmap().String()
				if ips[entry.IP] {
					continue
				}
				ips[entry.IP], seen[entry.IP] = true, true
				entry.NodeID, entry.NodeName = source.NodeID, source.Name
				r.Connections = append(r.Connections, entry)
			}
		}
		r.Sources = append(r.Sources, source)
	}
	if ready > 0 {
		r.Status = "partial"
		if ready == len(r.Sources) {
			r.Status = "ready"
		}
	}
	r.OnlineSourceCount = len(seen)
	sortClientConnections(r.Connections)
	return r
}

func sortClientConnections(rows []ClientConnection) {
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].LastSeen != rows[j].LastSeen {
			return rows[i].LastSeen > rows[j].LastSeen
		}
		if rows[i].IP != rows[j].IP {
			return rows[i].IP < rows[j].IP
		}
		return rows[i].NodeID < rows[j].NodeID
	})
}

func (s *ClientService) Devices(ctx context.Context, email string) (ClientDeviceReport, error) {
	slots, err := s.DeviceSlots(email)
	if err != nil {
		return ClientDeviceReport{}, err
	}
	traffic, err := s.DeviceTraffic(email)
	if err != nil {
		return ClientDeviceReport{}, err
	}
	connections, err := s.FleetClientConnections(ctx, email)
	maskDeviceConnections(&connections)
	return ClientDeviceReport{Devices: slots.Devices, Registered: slots.Registered, Limit: slots.Limit, Connections: connections, Traffic: traffic}, err
}
