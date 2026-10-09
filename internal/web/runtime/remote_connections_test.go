package runtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchClientConnectionsUsesLocalOnlyEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet || req.URL.Path != "/panel/api/clients/connections/alice+phone@example.com" || req.URL.RawQuery != "" {
			t.Errorf("unexpected request: %s %s", req.Method, req.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"obj":{"status":"ready","connections":[],"sources":[]}}`))
	}))
	defer srv.Close()
	r := NewRemote(nodeForPlainServer(t, srv, "verify", "tok"), nil)
	if _, err := r.FetchClientConnections(context.Background(), "alice+phone@example.com"); err != nil {
		t.Fatal(err)
	}
}
