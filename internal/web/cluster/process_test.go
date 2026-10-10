package cluster

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/op/go-logging"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/util/netsafe"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
)

// Each helper owns a separate database and process-wide gate, as real panels do.
func TestClusterProcessHelper(t *testing.T) {
	dir := os.Getenv("BOAN_CLUSTER_TEST_DIR")
	if dir == "" {
		t.Skip("subprocess helper")
	}
	guid := os.Getenv("BOAN_CLUSTER_TEST_GUID")
	logger.InitLogger(logging.ERROR)
	gin.SetMode(gin.TestMode)
	if err := database.InitDB(filepath.Join(dir, "panel.db")); err != nil {
		t.Fatal(err)
	}
	defer database.CloseDB()
	db := database.GetDB()
	if err := db.Model(&model.User{}).Where("id = 1").Update("username", "admin-"+guid).Error; err != nil {
		t.Fatal(err)
	}
	ib := model.Inbound{UserId: 1, Tag: guid, Port: 10000 + int(guid[0]), Protocol: model.VLESS, Settings: "{}", StreamSettings: "{}", Enable: true}
	if err := db.Create(&ib).Error; err != nil {
		t.Fatal(err)
	}
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Header("Content-Security-Policy", "script-src 'nonce-"+guid+"'"); c.Next() })
	engine.Use(Gateway("/"))
	var dropActivation, dropFollow bool
	var self Peer
	engine.GET("/panel/api/cluster/status", func(c *gin.Context) {
		s, err := Load(db)
		if err != nil {
			c.AbortWithStatus(500)
			return
		}
		c.JSON(200, Public(s))
	})
	engine.GET("/browser", func(c *gin.Context) {
		var u model.User
		_ = db.First(&u, 1).Error
		c.JSON(200, gin.H{"server": guid, "username": u.Username, "authorization": c.GetHeader("Authorization")})
	})
	engine.POST("/panel/api/cluster/rpc", func(c *gin.Context) {
		if c.GetHeader("Authorization") != "Bearer "+guid+"-token" {
			c.AbortWithStatus(403)
			return
		}
		var p Packet
		decoder := json.NewDecoder(c.Request.Body)
		decoder.UseNumber()
		if err := decoder.Decode(&p); err != nil {
			c.AbortWithStatus(400)
			return
		}
		var err error
		var out any
		switch p.Action {
		case "test-drop-activation":
			dropActivation = true
		case "test-drop-follow":
			dropFollow = true
		case "inspect":
			out, err = Inspect(guid)
		case "test-initialize":
			err = Initialize(c.Request.Context(), self)
		case "test-resume":
			err = Resume(c.Request.Context())
		case "transfer":
			err = Transfer(c.Request.Context(), p.Target)
		case "test-seed":
			for _, peer := range p.State.Peers {
				n := peer.Node
				n.ApiToken = peer.Token
				err = db.Create(&n).Error
				if err != nil {
					break
				}
				mirror := model.Inbound{UserId: 1, Tag: fmt.Sprintf("n%d-%s", n.Id, n.Guid), NodeID: &n.Id, OriginNodeGuid: n.Guid, Port: 10000 + int(n.Guid[0]), Protocol: model.VLESS, Settings: "{}", StreamSettings: "{}", Enable: true}
				err = db.Create(&mirror).Error
				if err != nil {
					break
				}
			}
			if err == nil {
				err = db.Create(&model.SubscriptionPlan{Name: "paid-plan", InboundIDs: "[1,2,3]", Enabled: true}).Error
			}
		default:
			err = Receive(guid, p)
		}
		if err == nil && p.Action == "activate" && dropActivation {
			dropActivation = false
			c.Status(503)
			return
		}
		if err == nil && p.Action == "follow" && dropFollow {
			dropFollow = false
			c.Status(503)
			return
		}
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		c.JSON(200, gin.H{"success": err == nil, "msg": msg, "obj": out})
	})
	server := httptest.NewTLSServer(engine)
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	port, _ := strconv.Atoi(endpoint.Port())
	digest := sha256.Sum256(server.Certificate().Raw)
	self = Peer{Node: model.Node{Name: guid, Guid: guid, Scheme: "https", Address: endpoint.Hostname(), Port: port, BasePath: "/", Enable: true, InboundSyncMode: "all", AllowPrivateAddress: true, TlsVerifyMode: "pin", PinnedCertSha256: hex.EncodeToString(digest[:])}, Token: guid + "-token"}
	raw, _ := json.Marshal(self)
	if err := os.WriteFile(filepath.Join(dir, "ready.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	// The parent terminates helpers through Process.Kill in cleanup.
	select {}
}

func startPanel(t *testing.T, guid string) Peer {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command(os.Args[0], "-test.run=^TestClusterProcessHelper$", "-test.timeout=90s")
	cmd.Env = append(os.Environ(), "BOAN_CLUSTER_TEST_DIR="+dir, "BOAN_CLUSTER_TEST_GUID="+guid, "XUI_DB_FOLDER="+dir)
	log, err := os.Create(filepath.Join(dir, "process.log"))
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdout = log
	cmd.Stderr = log
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait(); _ = log.Close() })
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		raw, e := os.ReadFile(filepath.Join(dir, "ready.json"))
		if e == nil {
			var p Peer
			if e = json.Unmarshal(raw, &p); e != nil {
				t.Fatal(e)
			}
			return p
		}
		time.Sleep(20 * time.Millisecond)
	}
	output, _ := os.ReadFile(filepath.Join(dir, "process.log"))
	t.Fatalf("helper failed: %s", output)
	return Peer{}
}

func TestThreePanelsSwitchAndSwitchBack(t *testing.T) {
	if os.Getenv("BOAN_CLUSTER_TEST_DIR") != "" {
		t.Skip("parent only")
	}
	a, b, c := startPanel(t, "a"), startPanel(t, "b"), startPanel(t, "c")
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if err := Call(ctx, a, Packet{Action: "test-seed", State: &State{Peers: []Peer{b, c}}}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Call(ctx, a, Packet{Action: "test-initialize"}, nil); err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct {
		from Peer
		to   string
	}{{a, "b"}, {b, "a"}, {a, "c"}} {
		if err := Call(ctx, step.from, Packet{Action: "transfer", Target: step.to}, nil); err != nil {
			t.Fatal(err)
		}
		active := 0
		for _, p := range []Peer{a, b, c} {
			var info Inspection
			if err := Call(ctx, p, Packet{Action: "inspect"}, &info); err != nil {
				t.Fatal(err)
			}
			if info.State.Primary != step.to || info.State.Phase != "active" {
				t.Fatalf("wrong membership: %+v", info.State)
			}
			if info.State.Self == info.State.Primary {
				active++
			}
			client, err := runtime.HTTPClientForNode(&p.Node, "")
			if err != nil {
				t.Fatal(err)
			}
			req, _ := http.NewRequestWithContext(netsafe.ContextWithAllowPrivate(ctx, true), http.MethodGet, fmt.Sprintf("https://%s:%d/browser", p.Node.Address, p.Node.Port), nil)
			resp, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			if policies := resp.Header.Values("Content-Security-Policy"); len(policies) != 1 || policies[0] != "script-src 'nonce-"+step.to+"'" {
				t.Fatalf("conflicting CSP from gateway: %v", policies)
			}
			var got map[string]string
			err = json.NewDecoder(resp.Body).Decode(&got)
			resp.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if got["server"] != step.to || got["username"] != "admin-a" || strings.TrimSpace(got["authorization"]) != "" {
				t.Fatalf("wrong unified login route: %#v", got)
			}
		}
		if active != 1 {
			t.Fatalf("active primaries = %d", active)
		}
	}
}

func TestInterruptedHandoffCanResumeAfterLostAcknowledgements(t *testing.T) {
	if os.Getenv("BOAN_CLUSTER_TEST_DIR") != "" {
		t.Skip("parent only")
	}
	a, b, c := startPanel(t, "a"), startPanel(t, "b"), startPanel(t, "c")
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if err := Call(ctx, a, Packet{Action: "test-seed", State: &State{Peers: []Peer{b, c}}}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Call(ctx, a, Packet{Action: "test-initialize"}, nil); err != nil {
		t.Fatal(err)
	}
	// A follower commits its new epoch but the old primary loses its reply.
	if err := Call(ctx, c, Packet{Action: "test-drop-follow"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Call(ctx, a, Packet{Action: "transfer", Target: "b"}, nil); err == nil {
		t.Fatal("expected interrupted follow")
	}
	for _, p := range []Peer{a, b, c} {
		var info Inspection
		if err := Call(ctx, p, Packet{Action: "inspect"}, &info); err != nil {
			t.Fatal(err)
		}
		if info.State.Self == info.State.Primary && info.State.Phase == "active" {
			t.Fatal("primary active during incomplete commit")
		}
	}
	// A user who entered through C must still reach A's recovery controls,
	// even though C already points at staged B and B still points at A.
	client, err := runtime.HTTPClientForNode(&c.Node, "")
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequestWithContext(netsafe.ContextWithAllowPrivate(ctx, true), http.MethodGet, fmt.Sprintf("https://%s:%d/panel/api/cluster/status", c.Node.Address, c.Node.Port), nil)
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var recovery PublicState
	err = json.NewDecoder(response.Body).Decode(&recovery)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if recovery.Self != "a" || recovery.Phase != "committing" {
		t.Fatalf("cannot reach initiating primary: %+v", recovery)
	}
	if err := Call(ctx, a, Packet{Action: "test-resume"}, nil); err != nil {
		t.Fatal(err)
	}
	// Now lose the activation reply itself: C is active, B must stay demoted.
	if err := Call(ctx, c, Packet{Action: "test-drop-activation"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := Call(ctx, b, Packet{Action: "transfer", Target: "c"}, nil); err == nil {
		t.Fatal("expected interrupted activation")
	}
	active := 0
	for _, p := range []Peer{a, b, c} {
		var info Inspection
		if err := Call(ctx, p, Packet{Action: "inspect"}, &info); err != nil {
			t.Fatal(err)
		}
		if info.State.Self == info.State.Primary && info.State.Phase == "active" {
			active++
		}
	}
	if active != 1 {
		t.Fatalf("active primaries after lost reply: %d", active)
	}
	if err := Call(ctx, b, Packet{Action: "test-resume"}, nil); err != nil {
		t.Fatal(err)
	}
	var info Inspection
	if err := Call(ctx, b, Packet{Action: "inspect"}, &info); err != nil {
		t.Fatal(err)
	}
	if info.State.Pending {
		t.Fatal("resume did not finish the journal")
	}
}
