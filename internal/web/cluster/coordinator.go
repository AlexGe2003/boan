package cluster

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/mhsanaei/3x-ui/v3/internal/crypto/nodetoken"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

// FinalizeSnapshot is installed by the controller at process initialization.
// It drains the frozen workers' final traffic counters into the primary.
var FinalizeSnapshot func(context.Context, *State) error

type Packet struct {
	Action   string    `json:"action"`
	State    *State    `json:"state,omitempty"`
	Snapshot *Snapshot `json:"snapshot,omitempty"`
	Target   string    `json:"target,omitempty"`
}
type Inspection struct {
	Schema        string               `json:"schema"`
	Subscription  SubscriptionEndpoint `json:"subscription"`
	Protocol      int                  `json:"protocol"`
	Guid          string               `json:"guid"`
	State         PublicState          `json:"state"`
	Inbounds      []model.Inbound      `json:"inbounds"`
	NodeCount     int64                `json:"nodeCount"`
	BusinessCount int64                `json:"businessCount"`
}

func Call(ctx context.Context, p Peer, packet Packet, out any) error {
	n := p.Node
	n.ApiToken = p.Token
	return runtime.NewRemote(&n, nil).ClusterRPC(ctx, packet, out)
}

func validPeer(p Peer, base string) error {
	n := p.Node
	if n.Scheme != "https" || (n.TlsVerifyMode != "verify" && n.TlsVerifyMode != "pin") {
		return errors.New("cluster members require HTTPS with certificate verification or pinning")
	}
	if n.OutboundTag != "" || !n.Enable || n.InboundSyncMode == "selected" {
		return errors.New("cluster members must be enabled direct nodes with full inbound sync and no outbound proxy")
	}
	if n.Guid == "" || p.Token == "" || n.BasePath != base {
		return errors.New("cluster members need a known identity, an admin token and the same panel base path")
	}
	return nil
}

func Inspect(guid string) (*Inspection, error) {
	db := database.GetDB()
	s, err := Load(db)
	if err != nil {
		return nil, err
	}
	out := &Inspection{Protocol: Protocol, Guid: guid, State: Public(s)}
	out.Schema, err = schemaSignature(db)
	if err != nil {
		return nil, err
	}
	out.Subscription, err = subscriptionEndpoint()
	if err != nil {
		return nil, err
	}
	if err = db.Where("node_id IS NULL").Find(&out.Inbounds).Error; err != nil {
		return nil, err
	}
	var bot model.Setting
	if err = db.Where("key IN ? AND value = ?", []string{"tgBotEnable", "discordBotEnable", "ldapEnable"}, "true").Find(&bot).Error; err != nil {
		return nil, err
	}
	if bot.Id != 0 {
		return nil, errors.New("disable Telegram, Discord and LDAP management before joining the cluster")
	}
	if err = db.Model(&model.Node{}).Count(&out.NodeCount).Error; err != nil {
		return nil, err
	}
	var users int64
	if err = db.Model(&model.User{}).Where("role <> ?", model.RoleAdmin).Count(&users).Error; err != nil {
		return nil, err
	}
	out.BusinessCount += users
	for _, table := range []string{"service_orders", "subscription_plans", "support_tickets"} {
		var count int64
		if err = db.Table(table).Count(&count).Error; err != nil {
			return nil, err
		}
		out.BusinessCount += count
	}
	return out, nil
}

func Initialize(ctx context.Context, self Peer) error {
	Operation.Lock()
	defer Operation.Unlock()
	Gate.Lock()
	defer Gate.Unlock()
	db := database.GetDB()
	existing, err := Load(db)
	if err != nil {
		return err
	}
	if existing != nil {
		return errors.New("cluster already initialized; use resume if enrollment was interrupted")
	}
	if err = validPeer(self, self.Node.BasePath); err != nil {
		return err
	}
	var errSub error
	self.Subscription, errSub = subscriptionEndpoint()
	if errSub != nil {
		return errSub
	}
	localSchema, err := schemaSignature(db)
	if err != nil {
		return err
	}
	var nodes []model.Node
	if err = db.Find(&nodes).Error; err != nil {
		return err
	}
	if len(nodes) == 0 {
		return errors.New("add at least one node before initializing the cluster")
	}
	s := &State{ClusterID: uuid.NewString(), Self: self.Node.Guid, Primary: self.Node.Guid, Epoch: 1, Phase: "joining", Peers: []Peer{self}}
	seen := map[string]bool{self.Node.Guid: true}
	for _, n := range nodes {
		token, e := nodetoken.Decrypt(n.Id, n.ApiToken)
		if e != nil {
			return e
		}
		p := Peer{Node: n, Token: token}
		p.Node.ApiToken = ""
		if e = validPeer(p, self.Node.BasePath); e != nil {
			return fmt.Errorf("%s: %w", n.Name, e)
		}
		if seen[n.Guid] {
			return errors.New("duplicate cluster member identity")
		}
		seen[n.Guid] = true
		var info Inspection
		if e = Call(ctx, p, Packet{Action: "inspect"}, &info); e != nil {
			return fmt.Errorf("%s: upgrade panel and configure an admin API token: %w", n.Name, e)
		}
		if info.Schema != localSchema || info.Protocol != Protocol || info.Guid != n.Guid || info.State.ClusterID != "" || info.NodeCount != 0 || info.BusinessCount != 0 {
			return fmt.Errorf("%s is not an independent worker: existing cluster, child nodes or business records must be reconciled first", n.Name)
		}
		p.Subscription = info.Subscription
		if p.Subscription.Enabled != self.Subscription.Enabled || p.Subscription.JSON != self.Subscription.JSON || p.Subscription.Clash != self.Subscription.Clash {
			return fmt.Errorf("%s: subscription formats must be enabled consistently on all nodes", n.Name)
		}
		s.Peers = append(s.Peers, p)
	}
	// Retain an enrollment journal before changing any peer. Re-running resume
	// is idempotent and never invents a second cluster after a timeout.
	if err = Save(db, s); err != nil {
		return err
	}
	return resumeLocked(ctx, s)
}

func Transfer(ctx context.Context, target string) error {
	Operation.Lock()
	defer Operation.Unlock()
	Gate.Lock()
	defer Gate.Unlock()
	db := database.GetDB()
	s, err := Load(db)
	if err != nil {
		return err
	}
	if s == nil {
		return errors.New("initialize the cluster first")
	}
	if s.Phase != "active" || s.Next != nil {
		return errors.New("a handoff is pending; resume it first")
	}
	if target == s.Primary {
		return errors.New("selected node is already primary")
	}
	if s.Self != s.Primary {
		return errors.New("start the handoff from the current primary")
	}
	if _, err = s.Peer(target); err != nil {
		return err
	}
	// Validate the destination before freezing the fleet. A stale mirror can
	// be corrected by normal synchronization while the primary is still active.
	targetPeer, _ := s.Peer(target)
	var preview Inspection
	if err = Call(ctx, targetPeer, Packet{Action: "inspect"}, &preview); err != nil {
		return err
	}
	probe, err := Capture(db)
	if err != nil {
		return err
	}
	if probe.Schema != preview.Schema {
		return errors.New("destination database schema differs; update all members before handoff")
	}
	selfPeer, err := s.Peer(s.Self)
	if err != nil {
		return err
	}
	if err = probe.Rebase(selfPeer, targetPeer, preview.Inbounds); err != nil {
		return err
	}
	if encoded, e := json.Marshal(probe); e != nil {
		return e
	} else if len(encoded) > 8<<20 {
		return errors.New("handoff snapshot exceeds the 8 MiB limit")
	}
	next := *s
	next.Coordinator = s.Self
	next.Peers = append([]Peer(nil), s.Peers...)
	for i := range next.Peers {
		if next.Peers[i].Node.Guid == s.Self {
			next.Peers[i].Node.Id = targetPeer.Node.Id
		}
		if next.Peers[i].Node.Guid == target {
			next.Peers[i].Node.Id = 0
		}
	}
	next.Epoch++
	next.Primary = target
	next.Next = nil
	next.Snapshot = nil
	next.Phase = "active"
	s.Next = &next
	s.Phase = "frozen"
	if err = Save(db, s); err != nil {
		return err
	}
	return resumeLocked(ctx, s)
}

func Resume(ctx context.Context) error {
	Operation.Lock()
	defer Operation.Unlock()
	Gate.Lock()
	defer Gate.Unlock()
	s, err := Load(database.GetDB())
	if err != nil {
		return err
	}
	if s == nil {
		return errors.New("no cluster journal")
	}
	return resumeLocked(ctx, s)
}

func resumeLocked(ctx context.Context, s *State) error {
	db := database.GetDB()
	if s.Phase == "joining" {
		joined := *s
		joined.Phase = "active"
		for _, p := range s.Peers {
			if p.Node.Guid != s.Self {
				if err := Call(ctx, p, Packet{Action: "join", State: &joined}, nil); err != nil {
					return err
				}
			}
		}
		s.Phase = "active"
		return Save(db, s)
	}
	if s.Next == nil {
		return errors.New("no pending handoff")
	}
	next := s.Next
	if next.Coordinator != "" && next.Coordinator != s.Self {
		return errors.New("resume the handoff on the initiating primary")
	}
	target, err := s.Peer(next.Primary)
	if err != nil {
		return err
	}
	// Once the former primary has recorded the new epoch it can only finish
	// activation. It must never return to the old primary role on RPC failure.
	if s.Epoch < next.Epoch {
		for _, p := range s.Peers {
			if p.Node.Guid != s.Self {
				if err = Call(ctx, p, Packet{Action: "freeze", State: s}, nil); err != nil {
					return err
				}
			}
		}
		if s.Snapshot == nil {
			if FinalizeSnapshot != nil {
				if err = FinalizeSnapshot(ctx, s); err != nil {
					return err
				}
			}
			var info Inspection
			if err = Call(ctx, target, Packet{Action: "inspect"}, &info); err != nil {
				return err
			}
			snapshot, e := Capture(db)
			if e != nil {
				return e
			}
			self, e := s.Peer(s.Self)
			if e != nil {
				return e
			}
			if e = snapshot.Rebase(self, target, info.Inbounds); e != nil {
				return e
			}
			s.Snapshot = snapshot
			if err = Save(db, s); err != nil {
				return err
			}
		}
		if err = Call(ctx, target, Packet{Action: "stage", State: next, Snapshot: s.Snapshot}, nil); err != nil {
			return err
		}
		s.Phase = "committing"
		if err = Save(db, s); err != nil {
			return err
		}
		// Followers route to the staged destination, which remains unavailable
		// until the former primary has durably relinquished its role.
		for _, p := range s.Peers {
			if p.Node.Guid != s.Self && p.Node.Guid != next.Primary {
				if err = Call(ctx, p, Packet{Action: "follow", State: next}, nil); err != nil {
					return err
				}
			}
		}
		committed := *next
		committed.Self = s.Self
		committed.Next = next
		committed.Phase = "active"
		if err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("1 = 1").Delete(&model.ClientGlobalTraffic{}).Error; err != nil {
				return err
			}
			return Save(tx, &committed)
		}); err != nil {
			return err
		}
		s = &committed
	}
	if err = Call(ctx, target, Packet{Action: "activate", State: next}, nil); err != nil {
		return err
	}
	s.Next = nil
	s.Snapshot = nil
	return Save(db, s)
}

func Receive(guid string, p Packet) error {
	Gate.Lock()
	defer Gate.Unlock()
	db := database.GetDB()
	s, err := Load(db)
	if err != nil {
		return err
	}
	if p.State == nil {
		return errors.New("missing cluster state")
	}
	incoming := *p.State
	incoming.Self = guid
	incoming.Next = nil
	incoming.Snapshot = nil
	if _, err = incoming.Peer(guid); err != nil {
		return err
	}
	if p.Action == "join" {
		if s != nil {
			if s.ClusterID == incoming.ClusterID && s.Epoch == incoming.Epoch {
				return nil
			}
			return errors.New("node already belongs to a cluster")
		}
		info, e := Inspect(guid)
		if e != nil {
			return e
		}
		if info.NodeCount != 0 || info.BusinessCount != 0 {
			return errors.New("node has independent management data")
		}
		if incoming.Primary == guid {
			return errors.New("cannot enroll another primary")
		}
		return Save(db, &incoming)
	}
	if s == nil || s.ClusterID != incoming.ClusterID {
		return errors.New("cluster identity mismatch")
	}
	if p.Action == "freeze" && p.State.Next != nil && s.Epoch == p.State.Next.Epoch && s.Primary == p.State.Next.Primary {
		return nil
	}
	if incoming.Epoch < s.Epoch {
		return errors.New("stale cluster epoch")
	}
	switch p.Action {
	case "abort":
		if incoming.Epoch != s.Epoch || incoming.Primary != s.Primary || s.Self == s.Primary {
			return errors.New("cannot cancel a committed handoff")
		}
		s.Phase = "active"
		s.Next = nil
		s.Snapshot = nil
		return Save(db, s)
	case "freeze":
		if s.Epoch > incoming.Epoch {
			return nil
		}
		if s.Primary != incoming.Primary || s.Self == s.Primary {
			return errors.New("primary cannot be frozen by a follower")
		}
		s.Phase = "frozen"
		return Save(db, s)
	case "stage":
		if incoming.Primary != guid || incoming.Epoch != s.Epoch+1 || s.Phase != "frozen" || p.Snapshot == nil {
			return errors.New("invalid handoff staging transition")
		}
		schema, err := schemaSignature(db)
		if err != nil {
			return err
		}
		if p.Snapshot.Schema != schema {
			return errors.New("destination database schema differs")
		}
		// Keep old epoch until activation, making repeated stage requests safe.
		s.Phase = "frozen"
		s.Next = &incoming
		s.Snapshot = p.Snapshot
		return Save(db, s)
	case "follow":
		if incoming.Primary == guid {
			return errors.New("use activation for the new primary")
		}
		if incoming.Epoch == s.Epoch && incoming.Primary == s.Primary {
			return nil
		}
		if s.Phase != "frozen" || incoming.Epoch != s.Epoch+1 {
			return errors.New("node must be frozen before changing primary")
		}
		return db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("1 = 1").Delete(&model.ClientGlobalTraffic{}).Error; err != nil {
				return err
			}
			return Save(tx, &incoming)
		})
	case "activate":
		if incoming.Primary != guid {
			return errors.New("wrong activation target")
		}
		if s.Epoch == incoming.Epoch && s.Primary == guid && s.Phase == "active" {
			return nil
		}
		if s.Next == nil || s.Next.Epoch != incoming.Epoch || s.Next.Primary != guid || s.Snapshot == nil {
			return errors.New("no matching staged snapshot")
		}
		return db.Transaction(func(tx *gorm.DB) error {
			backup, err := Capture(tx)
			if err != nil {
				return err
			}
			raw, err := json.Marshal(backup)
			if err != nil {
				return err
			}
			sealed, err := nodetoken.Encrypt(stateKey+1, string(raw))
			if err != nil {
				return err
			}
			if err = tx.Save(&model.ClusterBackup{ID: 1, Data: sealed}).Error; err != nil {
				return err
			}
			if err := s.Snapshot.Apply(tx); err != nil {
				return err
			}
			return Save(tx, &incoming)
		})
	}
	return errors.New("unknown cluster action")
}

func SelfPeer(rawURL, guid, token string, allowPrivate bool) (Peer, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return Peer{}, errors.New("enter this panel's reachable HTTPS URL, including its base path")
	}
	port := 443
	if u.Port() != "" {
		port, err = strconv.Atoi(u.Port())
		if err != nil {
			return Peer{}, err
		}
	}
	if strings.Contains(u.Hostname(), "/") {
		return Peer{}, errors.New("invalid hostname")
	}
	base := u.Path
	if base == "" {
		base = "/"
	}
	if !strings.HasSuffix(base, "/") {
		base += "/"
	}
	return Peer{Node: model.Node{Name: "原主站-" + guid[:min(8, len(guid))], Guid: guid, Scheme: "https", Address: u.Hostname(), Port: port, BasePath: base, TlsVerifyMode: "verify", Enable: true, InboundSyncMode: "all", AllowPrivateAddress: allowPrivate}, Token: token}, nil
}

// Abort is available only before the old primary starts committing the new
// epoch. After that boundary only Resume is safe.
func Abort(ctx context.Context) error {
	Operation.Lock()
	defer Operation.Unlock()
	Gate.Lock()
	defer Gate.Unlock()
	db := database.GetDB()
	s, err := Load(db)
	if err != nil {
		return err
	}
	if s == nil || s.Self != s.Primary || s.Phase != "frozen" || s.Next == nil {
		return errors.New("交接已开始提交，只能恢复，不能取消")
	}
	for _, p := range s.Peers {
		if p.Node.Guid != s.Self {
			if err = Call(ctx, p, Packet{Action: "abort", State: s}, nil); err != nil {
				return err
			}
		}
	}
	s.Phase = "active"
	s.Next = nil
	s.Snapshot = nil
	return Save(db, s)
}
