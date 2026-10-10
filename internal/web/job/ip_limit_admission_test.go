package job

import (
	"testing"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
)

func TestIpLimitKeepsAdmittedIPsAndRejectsFourth(t *testing.T) {
	setupIntegrationDB(t)
	const email = "ip-admission"
	inbound := seedInboundOnlyWithClient(t, "admission", email, 3)
	now := time.Now().Unix()
	old := []IPWithTimestamp{{IP: "192.0.2.1", Timestamp: now - 1}, {IP: "192.0.2.2", Timestamp: now - 1}, {IP: "192.0.2.3", Timestamp: now - 1}}
	row := seedClientIps(t, email, old)
	// Long-lived sessions have old dispatch times despite being online now.
	live := []IPWithTimestamp{{IP: "192.0.2.1", Timestamp: now - 7200}, {IP: "192.0.2.2", Timestamp: now - 7200}, {IP: "192.0.2.3", Timestamp: now - 7200}, {IP: "192.0.2.4", Timestamp: now}}
	j := NewCheckClientIpJob()
	if _, ban := j.updateInboundClientIps(database.GetDB(), row, inbound, email, 3, live, true, true); !ban {
		t.Fatal("fourth IP was allowed")
	}
	if len(j.disAllowedIps) != 1 || j.disAllowedIps[0] != "192.0.2.4" {
		t.Fatalf("banned %v", j.disAllowedIps)
	}
	persisted := readClientIps(t, email)
	if len(persisted) != 3 {
		t.Fatalf("stored %v", persisted)
	}
	for _, ip := range persisted {
		if ip.Timestamp < now {
			t.Fatalf("long-lived IP cannot be counted by other nodes: %v", ip)
		}
	}
	if _, ban := j.updateInboundClientIps(database.GetDB(), row, inbound, email, 3, live, true, true); ban {
		t.Fatal("frozen rejected connection repeatedly banned")
	}
}
