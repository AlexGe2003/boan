package panel

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	ws "github.com/gorilla/websocket"

	"github.com/mhsanaei/3x-ui/v3/internal/web/websocket"
)

func TestEntryClosureStopsExistingWebsocket(t *testing.T) {
	var allowed atomic.Bool
	allowed.Store(true)
	client := websocket.NewClient("entry-test")
	done := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := (&ws.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		(&WebSocketService{}).writePump(client, conn, allowed.Load)
		close(done)
	}))
	defer server.Close()
	conn, _, err := ws.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client.Send <- []byte("before")
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil || string(data) != "before" {
		t.Fatalf("initial message: %s %v", data, err)
	}
	allowed.Store(false)
	client.Send <- []byte("must not be delivered")
	if _, _, err := conn.ReadMessage(); err == nil {
		t.Fatal("received data after website closed")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("write pump did not stop")
	}
}
