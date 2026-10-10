package service

import (
	"bufio"
	"io"
	"net"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

type ActivityDestination struct {
	Host     string `json:"host"`
	Category string `json:"category"`
	Count    int    `json:"count"`
	LastSeen int64  `json:"lastSeen"`
}
type ActivityCategory struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}
type ActivityVisit struct {
	Host     string `json:"host"`
	Category string `json:"category"`
	Time     int64  `json:"time"`
	NodeName string `json:"nodeName,omitempty"`
}
type ActivitySource struct {
	NodeID      int    `json:"nodeId"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Connections int    `json:"connections"`
	Sampled     bool   `json:"sampled"`
}

type ClientActivity struct {
	Usage        *DestinationUsage     `json:"usage,omitempty"`
	Sources      []ActivitySource      `json:"sources,omitempty"`
	Status       string                `json:"status"`
	Sampled      bool                  `json:"sampled"`
	Demo         bool                  `json:"demo"`
	Since        int64                 `json:"since"`
	GeneratedAt  int64                 `json:"generatedAt"`
	Connections  int                   `json:"connections"`
	Destinations []ActivityDestination `json:"destinations"`
	Categories   []ActivityCategory    `json:"categories"`
	Recent       []ActivityVisit       `json:"recent"`
	Visits       []ActivityVisit       `json:"visits"`
}

func activityHost(target string) string {
	target = strings.TrimPrefix(strings.TrimPrefix(target, "tcp:"), "udp:")
	if strings.Contains(target, "://") {
		u, err := url.Parse(target)
		if err != nil {
			return ""
		}
		target = u.Host
	}
	target = strings.TrimPrefix(target, "//")
	if host, _, err := net.SplitHostPort(target); err == nil {
		target = host
	}
	target = strings.ToLower(strings.TrimSuffix(target, "."))
	if net.ParseIP(target) != nil {
		return net.ParseIP(target).String()
	}
	if len(target) == 0 || len(target) > 253 {
		return ""
	}
	for _, label := range strings.Split(target, ".") {
		if len(label) == 0 || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return ""
		}
	}
	for _, r := range target {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' && r != '.' {
			return ""
		}
	}
	return target
}

func activityCategory(host string) string {
	if ip := net.ParseIP(host); ip != nil {
		switch ip.String() {
		case "1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "149.112.112.112", "223.5.5.5", "223.6.6.6", "119.29.29.29", "114.114.114.114", "2606:4700:4700::1111", "2606:4700:4700::1001", "2001:4860:4860::8888", "2001:4860:4860::8844":
			return "DNS / 解析服务"
		}
		if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
			return "内网 / 本地网络"
		}
		return "纯 IP / 域名不可见"
	}
	rules := []struct {
		name    string
		domains []string
	}{
		{"DNS / 解析服务", []string{"dns.google", "cloudflare-dns.com", "one.one.one.one", "dns.alidns.com", "doh.pub", "dns.quad9.net"}},
		{"视频影音", []string{"youtube.com", "googlevideo.com", "ytimg.com", "netflix.com", "nflxvideo.net", "bilibili.com", "biliapi.net", "spotify.com", "twitch.tv", "youtu.be", "youtube-nocookie.com", "nflximg.net", "nflxso.net", "nflxext.com", "bilivideo.com", "hdslb.com", "biliapi.com", "scdn.co", "ttvnw.net", "tiktok.com", "tiktokcdn.com", "douyin.com", "douyinvod.com"}},
		{"社交沟通", []string{"telegram.org", "t.me", "discord.com", "discord.gg", "whatsapp.com", "instagram.com", "facebook.com", "x.com", "twitter.com", "reddit.com", "redd.it", "discordapp.com", "discordapp.net", "telegram.me", "telesco.pe", "twimg.com", "fbcdn.net", "cdninstagram.com", "whatsapp.net", "wechat.com", "weixin.qq.com"}},
		{"开发工具", []string{"github.com", "githubusercontent.com", "gitlab.com", "npmjs.org", "npmjs.com", "stackoverflow.com", "docker.com", "docker.io", "githubassets.com", "ghcr.io", "pypi.org", "pythonhosted.org", "jsdelivr.net", "unpkg.com"}},
		{"AI 服务", []string{"openai.com", "chatgpt.com", "anthropic.com", "claude.ai", "gemini.google.com", "deepseek.com", "oaistatic.com", "oaiusercontent.com", "perplexity.ai", "copilot.microsoft.com", "aistudio.google.com"}},
		{"搜索资讯", []string{"google.com", "bing.com", "baidu.com", "wikipedia.org", "bbc.com", "cnn.com"}},
		{"购物消费", []string{"amazon.com", "taobao.com", "jd.com", "ebay.com", "aliexpress.com"}},
	}
	for _, rule := range rules {
		for _, domain := range rule.domains {
			if host == domain || strings.HasSuffix(host, "."+domain) {
				return rule.name
			}
		}
	}
	return "其他 / 未分类"
}

func readClientActivity(path, email string, hours int, now time.Time, scopes ...string) (ClientActivity, error) {
	r := ClientActivity{Status: "disabled", Since: now.Add(-time.Duration(hours) * time.Hour).UnixMilli(), GeneratedAt: now.UnixMilli(), Destinations: []ActivityDestination{}, Categories: []ActivityCategory{}, Recent: []ActivityVisit{}, Visits: []ActivityVisit{}}
	if path == "" || path == "none" {
		return r, nil
	}
	f, err := os.Open(path)
	if err != nil {
		r.Status = "unavailable"
		return r, nil
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return r, err
	}
	if !info.Mode().IsRegular() {
		r.Status = "unavailable"
		return r, nil
	}
	const maxBytes = 8 << 20
	start := max(int64(0), info.Size()-maxBytes)
	r.Sampled = start > 0
	reader := bufio.NewReader(io.NewSectionReader(f, start, info.Size()-start))
	if start > 0 {
		_, _ = reader.ReadString('\n')
	}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 64<<10)
	domains := map[string]ActivityDestination{}
	categories := map[string]int{}
	visits := []ActivityVisit{}
	for scanner.Scan() {
		line := scanner.Text()
		entry := parseAccessLogFields(line)
		if entry.Email != email || entry.DateTime.IsZero() || entry.ToAddress == "" {
			continue
		}
		t := entry.DateTime.UnixMilli()
		if t < r.Since || t > r.GeneratedAt {
			continue
		}
		host := activityHost(entry.ToAddress)
		if host == "" {
			continue
		}
		category := activityCategory(host)
		// Filter before ranking and limiting so noisy IP traffic cannot crowd out websites.
		network := net.ParseIP(host) != nil || category == "DNS / 解析服务"
		if len(scopes) > 0 && (scopes[0] == "web" && network || scopes[0] == "network" && !network) {
			continue
		}
		d := domains[host]
		d.Host = host
		d.Category = category
		d.Count++
		d.LastSeen = max(d.LastSeen, t)
		domains[host] = d
		categories[category]++
		r.Connections++
		if strings.Contains(line, "[boan-demo]") {
			r.Demo = true
		}
		visits = append(visits, ActivityVisit{Host: host, Category: category, Time: t})
	}
	if err := scanner.Err(); err != nil {
		return r, err
	}
	r.Status = "ready"
	for _, d := range domains {
		r.Destinations = append(r.Destinations, d)
	}
	for name, count := range categories {
		r.Categories = append(r.Categories, ActivityCategory{Name: name, Count: count})
	}
	sort.Slice(r.Destinations, func(i, j int) bool {
		if r.Destinations[i].Count == r.Destinations[j].Count {
			return r.Destinations[i].Host < r.Destinations[j].Host
		}
		return r.Destinations[i].Count > r.Destinations[j].Count
	})
	sort.Slice(r.Categories, func(i, j int) bool {
		if r.Categories[i].Count == r.Categories[j].Count {
			return r.Categories[i].Name < r.Categories[j].Name
		}
		return r.Categories[i].Count > r.Categories[j].Count
	})
	sort.Slice(visits, func(i, j int) bool { return visits[i].Time > visits[j].Time })
	seen := map[string]bool{}
	for _, v := range visits {
		if len(r.Visits) < 100 {
			r.Visits = append(r.Visits, v)
		}
		if v.Time >= now.Add(-2*time.Minute).UnixMilli() && !seen[v.Host] && len(r.Recent) < 30 {
			r.Recent = append(r.Recent, v)
			seen[v.Host] = true
		}
	}
	if len(r.Destinations) > 50 {
		r.Sampled = true
		r.Destinations = r.Destinations[:50]
	}
	return r, nil
}

func (s *ClientService) Activity(email string, hours int, scopes ...string) (ClientActivity, error) {
	path, err := xray.GetAccessLogPath()
	if err != nil {
		result, _ := readClientActivity("", email, hours, time.Now())
		result.Status = "unavailable"
		return result, nil
	}
	result, err := readClientActivity(path, email, hours, time.Now(), scopes...)
	result.Usage = readDestinationUsage(os.Getenv("BOAN_DESTINATION_USAGE_FILE"), email, time.Now())
	return result, err
}
