package config

import "testing"

func TestLocalTrafficRate(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  int64
	}{{"", 1000}, {"1.0", 1000}, {"0.1", 100}, {"0.001", 1}, {"100", 100000}, {"-1", 0}, {"0", 0}, {"NaN", 0}, {"1.2345", 0}, {"100.001", 0}} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("XUI_LOCAL_TRAFFIC_MULTIPLIER", tc.value)
			got, err := LocalTrafficRate()
			if tc.want == 0 {
				if err == nil {
					t.Fatal("accepted invalid multiplier")
				}
			} else if err != nil || got != tc.want {
				t.Fatalf("got %d %v", got, err)
			}
		})
	}
}
