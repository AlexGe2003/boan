package runtime

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// ClusterRPC requires an admin token on the receiving panel.
func (r *Remote) ClusterRPC(ctx context.Context, body any, out any) error {
	e, err := r.do(ctx, http.MethodPost, "panel/api/cluster/rpc", body)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(e.Obj, out)
}

// ClusterInbounds reads frozen worker counters without optional presence RPCs.
func (r *Remote) ClusterInbounds(ctx context.Context) ([]*model.Inbound, error) {
	e, err := r.do(ctx, http.MethodGet, "panel/api/inbounds/list", nil)
	if err != nil {
		return nil, err
	}
	var inbounds []*model.Inbound
	err = json.Unmarshal(e.Obj, &inbounds)
	return inbounds, err
}
