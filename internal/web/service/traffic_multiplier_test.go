package service

import (
	"math"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestLocalQuotaMultiplier(t *testing.T) {
	for _, tc := range []struct {
		rate string
		want int64
	}{{"1.0", 10 << 30}, {"0.1", 1 << 30}} {
		t.Run(tc.rate, func(t *testing.T) {
			db := initTrafficTestDB(t)
			t.Setenv("XUI_LOCAL_TRAFFIC_MULTIPLIER", tc.rate)
			if err := db.Create(&xray.ClientTraffic{Email: "weighted", Enable: true, Up: 123}).Error; err != nil {
				t.Fatal(err)
			}
			svc := InboundService{}
			if err := svc.addClientTraffic(db, []*xray.ClientTraffic{{Email: "weighted", Up: 10 << 30}}); err != nil {
				t.Fatal(err)
			}
			got := readTraffic(t, db, "weighted")
			if got.Up != 123+tc.want || got.RawUp != 10<<30 || !got.RawKnown {
				t.Fatalf("wrong quota/raw: %+v", got)
			}
			var usage model.ServerClientUsage
			if err := db.Where("email = ?", "weighted").Take(&usage).Error; err != nil {
				t.Fatal(err)
			}
			if usage.Up != 10<<30 {
				t.Fatalf("wire traffic scaled: %d", usage.Up)
			}
		})
	}
}

func TestQuotaFractionSurvivesTicksAndRenewalKeepsRaw(t *testing.T) {
	db := initTrafficTestDB(t)
	t.Setenv("XUI_LOCAL_TRAFFIC_MULTIPLIER", "0.1")
	if err := db.Create(&xray.ClientTraffic{Email: "fraction", Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	svc := InboundService{}
	for i := 0; i < 10; i++ {
		if err := svc.addClientTraffic(db, []*xray.ClientTraffic{{Email: "fraction", Up: 1, Down: 3}}); err != nil {
			t.Fatal(err)
		}
	}
	got := readTraffic(t, db, "fraction")
	if got.Up != 1 || got.Down != 3 || got.QuotaUpRemainder != 0 || got.QuotaDownRemainder != 0 {
		t.Fatalf("lost fractional bytes: %+v", got)
	}
	if err := db.Model(&xray.ClientTraffic{}).Where("email = ?", "fraction").Updates(map[string]any{"up": 0, "down": 0}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.addClientTraffic(db, []*xray.ClientTraffic{{Email: "fraction", Up: 10, Down: 10}}); err != nil {
		t.Fatal(err)
	}
	got = readTraffic(t, db, "fraction")
	if got.Up != 1 || got.Down != 1 || got.RawUp != 20 || got.RawDown != 40 {
		t.Fatalf("renewal lost wire history: %+v", got)
	}
}

func TestRemoteWeightedQuotaAndRawUsage(t *testing.T) {
	db := initTrafficTestDB(t)
	// Even a discounted parent must never scale already charged child snapshots.
	t.Setenv("XUI_LOCAL_TRAFFIC_MULTIPLIER", "0.1")
	createNodeInbound(t, db, 1, "weighted", 41001)
	createNodeInbound(t, db, 2, "normal", 41002)
	svc := &InboundService{}
	snap := xray.ClientTraffic{Email: "mixed", Enable: true, RawKnown: true}
	syncNode(t, svc, 1, "weighted", snap)
	syncNode(t, svc, 2, "normal", snap)
	snap.Up = 100
	snap.RawUp = 1000
	syncNode(t, svc, 1, "weighted", snap)
	syncNode(t, svc, 1, "weighted", snap)
	snap.Up = 1000
	syncNode(t, svc, 2, "normal", snap)
	got := readTraffic(t, db, "mixed")
	if got.Up != 1100 || got.RawUp != 2000 {
		t.Fatalf("scaled twice or lost raw: %+v", got)
	}
	var usage model.ServerClientUsage
	if err := db.Where("node_id = ? AND email = ?", 1, "mixed").Take(&usage).Error; err != nil {
		t.Fatal(err)
	}
	if usage.Up != 1000 {
		t.Fatalf("wire usage=%d", usage.Up)
	}
	// A quota reset does not reset lifetime wire counters.
	snap.Up = 0
	snap.RawUp = 1000
	syncNode(t, svc, 1, "weighted", snap)
	snap.Up = 10
	snap.RawUp = 1100
	syncNode(t, svc, 1, "weighted", snap)
	got = readTraffic(t, db, "mixed")
	if got.RawUp != 2100 {
		t.Fatalf("reset recounted raw traffic: %+v", got)
	}
}

func TestScaleQuotaOverflow(t *testing.T) {
	got, _, err := scaleQuotaBytes(math.MaxInt64, 1000, 0)
	if err != nil || got != math.MaxInt64 {
		t.Fatalf("identity overflow: %d %v", got, err)
	}
	if _, _, err = scaleQuotaBytes(math.MaxInt64, 100000, 0); err == nil {
		t.Fatal("expected overflow error")
	}
}
