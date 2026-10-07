package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// LocalTrafficRate returns thousandths of quota bytes per local wire byte.
// Remote snapshots already contain quota bytes and must not be scaled again.
func LocalTrafficRate() (int64, error) {
	value := strings.TrimSpace(os.Getenv("XUI_LOCAL_TRAFFIC_MULTIPLIER"))
	if value == "" {
		return 1000, nil
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return 0, fmt.Errorf("invalid local traffic multiplier %q", value)
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 3 {
		return 0, fmt.Errorf("local traffic multiplier supports at most 3 decimals")
	}
	for _, c := range parts[0] + fraction {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid local traffic multiplier %q", value)
		}
	}
	rate, err := strconv.ParseInt(parts[0]+fraction+strings.Repeat("0", 3-len(fraction)), 10, 64)
	if err != nil || rate < 1 || rate > 100000 {
		return 0, fmt.Errorf("local traffic multiplier must be between 0.001 and 100")
	}
	return rate, nil
}
