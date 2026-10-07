package dispatcher

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/xtls/xray-core/common"
	"github.com/xtls/xray-core/common/buf"
	"github.com/xtls/xray-core/common/net"
	"github.com/xtls/xray-core/common/session"
	"github.com/xtls/xray-core/transport"
)

const usageMaxEntries = 20000
const usageMaxUsers = 1024

type usageRow struct {
	Email    string `json:"email"`
	Host     string `json:"host"`
	Up       int64  `json:"up"`
	Down     int64  `json:"down"`
	LastSeen int64  `json:"lastSeen"`
}
type usageFile struct {
	Version   int        `json:"version"`
	Since     int64      `json:"since"`
	UpdatedAt int64      `json:"updatedAt"`
	Overflow  bool       `json:"overflow"`
	Rows      []usageRow `json:"rows"`
}
type usageCounter struct {
	ledger         *usageLedger
	email, host    string
	up, down, last atomic.Int64
}
type usageLedger struct {
	mu       sync.Mutex
	flushMu  sync.Mutex
	path     string
	since    int64
	overflow bool
	entries  map[string]*usageCounter
	users    map[string]bool
}

func newUsageLedger(path string) (*usageLedger, error) {
	l := &usageLedger{path: path, since: time.Now().UnixMilli(), entries: map[string]*usageCounter{}, users: map[string]bool{}}
	raw, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err == nil {
		if len(raw) > 16<<20 {
			return nil, fmt.Errorf("usage ledger too large")
		}
		var f usageFile
		if err = json.Unmarshal(raw, &f); err != nil {
			return nil, err
		}
		if f.Version != 1 || len(f.Rows) > usageMaxEntries+usageMaxUsers {
			return nil, fmt.Errorf("invalid usage ledger")
		}
		l.since, l.overflow = f.Since, f.Overflow
		for _, r := range f.Rows {
			if r.Up < 0 || r.Down < 0 {
				return nil, fmt.Errorf("negative usage")
			}
			c := &usageCounter{email: r.Email, host: r.Host, ledger: l}
			c.up.Store(r.Up)
			c.down.Store(r.Down)
			c.last.Store(r.LastSeen)
			l.entries[r.Email+"\x00"+r.Host] = c
			l.users[r.Email] = true
		}
	}
	return l, nil
}
func (l *usageLedger) counter(email, host string) *usageCounter {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := email + "\x00" + host
	if c := l.entries[key]; c != nil {
		return c
	}
	if !l.users[email] && len(l.users) >= usageMaxUsers {
		l.overflow = true
		return nil
	}
	if len(l.entries) >= usageMaxEntries {
		host = "__other__"
		key = email + "\x00" + host
		l.overflow = true
		if c := l.entries[key]; c != nil {
			return c
		}
	}
	c := &usageCounter{email: email, host: host, ledger: l}
	l.entries[key] = c
	l.users[email] = true
	return c
}
func (l *usageLedger) flush() error {
	l.flushMu.Lock()
	defer l.flushMu.Unlock()
	l.mu.Lock()
	f := usageFile{Version: 1, Since: l.since, UpdatedAt: time.Now().UnixMilli(), Overflow: l.overflow, Rows: make([]usageRow, 0, len(l.entries))}
	for _, c := range l.entries {
		f.Rows = append(f.Rows, usageRow{c.email, c.host, c.up.Load(), c.down.Load(), c.last.Load()})
	}
	l.mu.Unlock()
	raw, err := json.Marshal(f)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(l.path), 0700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(l.path), ".usage-*")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.Write(raw); err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, l.path)
}

var usageOnce sync.Once
var destinationUsage *usageLedger

func startDestinationUsage() {
	usageOnce.Do(func() {
		path := os.Getenv("BOAN_DESTINATION_USAGE_FILE")
		if path == "" {
			return
		}
		var err error
		destinationUsage, err = newUsageLedger(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, "destination usage disabled:", err)
			return
		}
		if err = destinationUsage.flush(); err != nil {
			fmt.Fprintln(os.Stderr, "destination usage persistence:", err)
		}
		go func() {
			for range time.NewTicker(5 * time.Second).C {
				if err := destinationUsage.flush(); err != nil {
					fmt.Fprintln(os.Stderr, "destination usage persistence:", err)
				}
			}
		}()
	})
}
func flushDestinationUsage() {
	if destinationUsage != nil {
		_ = destinationUsage.flush()
	}
}

func wrapDestinationUsage(ctx context.Context, link *transport.Link, destination net.Destination) {
	if destinationUsage == nil {
		return
	}
	ib := session.InboundFromContext(ctx)
	if ib == nil || ib.User == nil || ib.User.Email == "" || len(ib.User.Email) > 320 {
		return
	}
	host := strings.ToLower(strings.TrimSuffix(destination.Address.String(), "."))
	// Mux's outer link contains frames, not a single destination. Its inner links are counted separately.
	if host == "v1.mux.cool" || host == "v1.rvs.cool" || len(host) > 253 {
		return
	}
	counter := destinationUsage.counter(ib.User.Email, host)
	if counter == nil {
		return
	}
	link.Reader = &usageReader{reader: link.Reader, c: counter}
	link.Writer = &usageWriter{writer: link.Writer, c: counter}
}

type usageReader struct {
	reader buf.Reader
	c      *usageCounter
}

func (r *usageReader) ReadMultiBuffer() (buf.MultiBuffer, error) {
	mb, err := r.reader.ReadMultiBuffer()
	recordUsage(r.c, mb, true)
	return mb, err
}
func (r *usageReader) Interrupt() { common.Interrupt(r.reader) }

type usageWriter struct {
	writer buf.Writer
	c      *usageCounter
}

func (w *usageWriter) WriteMultiBuffer(mb buf.MultiBuffer) error {
	recordUsage(w.c, mb, false)
	return w.writer.WriteMultiBuffer(mb)
}
func (w *usageWriter) Close() error { return common.Close(w.writer) }
func (w *usageWriter) Interrupt()   { common.Interrupt(w.writer) }

func recordUsage(c *usageCounter, mb buf.MultiBuffer, up bool) {
	now := time.Now().UnixMilli()
	for _, b := range mb {
		if b == nil {
			continue
		}
		target := c
		if b.UDP != nil && c.ledger != nil {
			host := strings.ToLower(strings.TrimSuffix(b.UDP.Address.String(), "."))
			if host != c.host {
				target = c.ledger.counter(c.email, host)
			}
		}
		if target == nil {
			continue
		}
		if up {
			target.up.Add(int64(b.Len()))
		} else {
			target.down.Add(int64(b.Len()))
		}
		target.last.Store(now)
	}
}
