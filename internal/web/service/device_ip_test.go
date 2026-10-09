package service

import "testing"

func TestMaskDeviceIP(t *testing.T) {
	for _, tc := range []struct{ raw, want string }{
		{"192.0.2.42", "192.0.*.42"},
		{"::ffff:192.0.2.42", "192.0.*.42"},
		{"2001:db8:abcd:1234::42", "2001:db8:abcd:*:*:*:*:*"},
		{"bad-address", ""}, {"", ""},
	} {
		if got := MaskDeviceIP(tc.raw); got != tc.want {
			t.Errorf("MaskDeviceIP(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestMaskedConnectionsKeepDistinctSources(t *testing.T) {
	report := ClientConnectionReport{OnlineSourceCount: 2, Connections: []ClientConnection{{IP: "192.0.2.1"}, {IP: "192.0.2.2"}}}
	maskDeviceConnections(&report)
	if report.OnlineSourceCount != 2 || len(report.Connections) != 2 || report.Connections[0].IP != "192.0.*.1" || report.Connections[1].IP != "192.0.*.2" {
		t.Fatalf("masking must not collapse distinct sources: %+v", report)
	}
}
