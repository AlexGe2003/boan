package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/web/cluster"
	"github.com/mhsanaei/3x-ui/v3/internal/web/runtime"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service"
	"github.com/mhsanaei/3x-ui/v3/internal/web/service/panel"
	"github.com/mhsanaei/3x-ui/v3/internal/web/session"
)

func registerCluster(g *gin.RouterGroup) {
	g.Use(func(c *gin.Context) {
		u := session.GetLoginUser(c)
		if u == nil || !u.IsAdmin() {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Next()
	})
	g.GET("/status", func(c *gin.Context) {
		s, err := cluster.Load(database.GetDB())
		jsonMsgObj(c, "", cluster.Public(s), err)
	})
	g.POST("/initialize", initializeCluster)
	g.POST("/transfer", transferCluster)
	g.POST("/resume", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		jsonMsg(c, "恢复主站交接", cluster.Resume(ctx))
	})
	g.POST("/abort", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		jsonMsg(c, "取消交接", cluster.Abort(ctx))
	})
	g.POST("/rpc", clusterRPC)
}

func initializeCluster(c *gin.Context) {
	var req struct {
		URL          string `json:"url"`
		AllowPrivate bool   `json:"allowPrivate"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, "", err)
		return
	}
	existing, loadErr := cluster.Load(database.GetDB())
	if loadErr != nil {
		jsonMsg(c, "", loadErr)
		return
	}
	if existing != nil {
		jsonMsg(c, "", errors.New("集群已启用，请恢复未完成交接"))
		return
	}
	guid, err := (&service.SettingService{}).GetPanelGuid()
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	// Generate a dedicated revocable credential, never reuse a browser session.
	tokens := panel.ApiTokenService{}
	token, err := tokens.Create("cluster-"+time.Now().UTC().Format("20060102T150405.000000000"), model.ApiScopeAdmin, 0)
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	peer, err := cluster.SelfPeer(req.URL, guid, token.Token, req.AllowPrivate)
	if err == nil && peer.Node.BasePath != c.GetString("base_path") {
		err = errors.New("URL base path must match this panel")
	}
	if err == nil {
		// Verify the supplied public address reaches this exact panel before saving.
		var info cluster.Inspection
		err = cluster.Call(c.Request.Context(), peer, cluster.Packet{Action: "inspect"}, &info)
		if err == nil && info.Guid != guid {
			err = errors.New("URL points to a different panel")
		}
	}
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		err = cluster.Initialize(ctx, peer)
	}
	if err != nil {
		s, loadErr := cluster.Load(database.GetDB())
		storedToken := ""
		if s != nil {
			p, e := s.Peer(guid)
			if e == nil {
				storedToken = p.Token
			}
		}
		if loadErr == nil && storedToken != token.Token {
			_ = tokens.Delete(token.Id)
		}
	}
	jsonMsg(c, "启用统一登录", err)
}

func transferCluster(c *gin.Context) {
	var req struct {
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonMsg(c, "", err)
		return
	}
	s, err := cluster.Load(database.GetDB())
	if err != nil || s == nil {
		if err == nil {
			err = errors.New("请先启用集群")
		}
		jsonMsg(c, "", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if s.Primary != s.Self {
		peer, e := s.Peer(s.Primary)
		err = e
		if err == nil {
			err = cluster.Call(ctx, peer, cluster.Packet{Action: "transfer", Target: req.Target}, nil)
		}
	} else {
		err = cluster.Transfer(ctx, req.Target)
	}
	afterClusterChange()
	jsonMsg(c, "切换主站", err)
}

func clusterRPC(c *gin.Context) {
	scope, ok := c.Get("api_token_scope")
	if !ok || scope != model.ApiScopeAdmin {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var p cluster.Packet
	decoder := json.NewDecoder(c.Request.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&p); err != nil {
		jsonMsg(c, "", err)
		return
	}
	guid, err := (&service.SettingService{}).GetPanelGuid()
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	if p.Action == "inspect" {
		info, e := cluster.Inspect(guid)
		jsonMsgObj(c, "", info, e)
		return
	}
	if p.Action == "transfer" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		jsonMsg(c, "", cluster.Transfer(ctx, p.Target))
		return
	}
	err = cluster.Receive(guid, p)
	afterClusterChange()
	if err == nil && p.Action == "activate" {
		if mgr := runtime.GetManager(); mgr != nil {
			var nodes []model.Node
			_ = database.GetDB().Find(&nodes).Error
			for _, n := range nodes {
				mgr.InvalidateNode(n.Id)
			}
		}
		(&service.XrayService{}).SetToNeedRestart()
	}
	jsonMsg(c, "", err)
}

// Direct machine credentials retain dataplane access on followers, while all
// account, billing and fleet configuration writes belong to the primary.
func enforceClusterRole(c *gin.Context) {
	rel := relAPIPath(c.FullPath())
	if strings.HasPrefix(rel, "/cluster/") {
		c.Next()
		return
	}
	s, err := cluster.Load(database.GetDB())
	if err != nil {
		c.AbortWithStatus(503)
		return
	}
	if s == nil {
		c.Next()
		return
	}
	if s.Self != s.Primary {
		methods, ok := nodeSyncScopeAllow[rel]
		_, methodOK := methods[c.Request.Method]
		if !ok || !methodOK {
			c.AbortWithStatusJSON(409, gin.H{"success": false, "msg": "请通过当前主站管理账号和集群"})
			return
		}
	}
	if c.Request.Method != http.MethodGet && (rel == "/nodes/add" || rel == "/nodes/update/:id" || rel == "/nodes/del/:id" || rel == "/nodes/setEnable/:id" || rel == "/server/importDB") {
		c.AbortWithStatusJSON(409, gin.H{"success": false, "msg": "集群运行期间不能单独变更成员连接或导入数据库"})
		return
	}
	c.Next()
}

func init() { cluster.FinalizeSnapshot = finalizeClusterSnapshot }
func finalizeClusterSnapshot(ctx context.Context, s *cluster.State) error {
	for _, peer := range s.Peers {
		if peer.Node.Guid == s.Self {
			continue
		}
		node := peer.Node
		node.ApiToken = peer.Token
		inbounds, err := runtime.NewRemote(&node, nil).ClusterInbounds(ctx)
		if err != nil {
			return err
		}
		snap := &runtime.TrafficSnapshot{Inbounds: inbounds}
		if _, err = (&service.InboundService{}).SetRemoteTraffic(node.Id, snap, node.ConfigDirty, false); err != nil {
			return err
		}
	}
	return nil
}

func afterClusterChange() {
	s, err := cluster.Load(database.GetDB())
	if err != nil || s == nil || s.Self == s.Primary {
		return
	}
	(&service.InboundService{}).RetainSyncedNodeOnlineClients(nil)
	(&service.NodeService{}).RetainEnabledNodeDescendants(nil)
}
