// Package cluster coordinates explicit, fail-closed panel handoffs.
package cluster

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/mhsanaei/3x-ui/v3/internal/crypto/nodetoken"
	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"gorm.io/gorm"
)

const Protocol = 1
const stateKey = -2147483647

var Gate sync.RWMutex
var Operation sync.Mutex

// Peer carries a portable (decrypted) credential only inside encrypted state
// or a verified TLS RPC. Public responses must use PublicState.
type Peer struct {
	Subscription SubscriptionEndpoint `json:"subscription"`
	Node         model.Node           `json:"node"`
	Token        string               `json:"token"`
}
type State struct {
	Coordinator string    `json:"coordinator,omitempty"`
	ClusterID   string    `json:"clusterId"`
	Self        string    `json:"self"`
	Primary     string    `json:"primary"`
	Epoch       int64     `json:"epoch"`
	Phase       string    `json:"phase"` // active, joining, frozen, committing
	Peers       []Peer    `json:"peers"`
	Next        *State    `json:"next,omitempty"`
	Snapshot    *Snapshot `json:"snapshot,omitempty"`
}
type PublicState struct {
	Pending   bool         `json:"pending"`
	Protocol  int          `json:"protocol"`
	ClusterID string       `json:"clusterId"`
	Self      string       `json:"self"`
	Primary   string       `json:"primary"`
	Epoch     int64        `json:"epoch"`
	Phase     string       `json:"phase"`
	Peers     []model.Node `json:"peers"`
}

func Load(db *gorm.DB) (*State, error) {
	if db == nil {
		return nil, nil
	}
	var row model.ClusterState
	err := db.First(&row, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		if strings.Contains(err.Error(), "no such table: cluster_states") || strings.Contains(err.Error(), `relation "cluster_states" does not exist`) {
			return nil, nil
		}
		return nil, err
	}
	raw, err := nodetoken.Decrypt(stateKey, row.Data)
	if err != nil {
		return nil, err
	}
	var s State
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	if err = decoder.Decode(&s); err != nil {
		return nil, err
	}
	return &s, nil
}
func Save(db *gorm.DB, s *State) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	encrypted, err := nodetoken.Encrypt(stateKey, string(raw))
	if err != nil {
		return err
	}
	return db.Save(&model.ClusterState{ID: 1, Data: encrypted}).Error
}
func Public(s *State) PublicState {
	p := PublicState{Protocol: Protocol, Phase: "standalone"}
	if s == nil {
		return p
	}
	p.Pending = s.Next != nil || s.Phase != "active"
	p.ClusterID = s.ClusterID
	p.Self = s.Self
	p.Primary = s.Primary
	p.Epoch = s.Epoch
	p.Phase = s.Phase
	for _, peer := range s.Peers {
		n := peer.Node
		n.ApiToken = ""
		p.Peers = append(p.Peers, n)
	}
	return p
}
func (s *State) Peer(guid string) (Peer, error) {
	for _, p := range s.Peers {
		if p.Node.Guid == guid {
			return p, nil
		}
	}
	return Peer{}, fmt.Errorf("cluster member %q is missing", guid)
}

// BeginJob holds the read lock until all work (including child goroutines) ends.
// Local dataplane jobs keep running on followers; fleet jobs run only on primary.
func BeginJob(fleet bool) (func(), bool) {
	Gate.RLock()
	s, err := Load(database.GetDB())
	if err != nil || (s != nil && (s.Phase != "active" || (fleet && s.Primary != s.Self))) {
		Gate.RUnlock()
		return func() {}, false
	}
	return Gate.RUnlock, true
}
