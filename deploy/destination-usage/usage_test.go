package dispatcher

import (
	"encoding/json"
	"github.com/xtls/xray-core/common/buf"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestUsageLedgerPersistenceAndIsolation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usage.json")
	l, err := newUsageLedger(path)
	if err != nil {
		t.Fatal(err)
	}
	a := l.counter("alice", "example.com")
	b := l.counter("bob", "example.com")
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				a.up.Add(7)
				a.down.Add(11)
			}
		}()
	}
	wg.Wait()
	b.up.Add(13)
	if err = l.flush(); err != nil {
		t.Fatal(err)
	}
	l2, err := newUsageLedger(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := l2.counter("alice", "example.com"); got.up.Load() != 56000 || got.down.Load() != 88000 {
		t.Fatal("wrong persisted counters")
	}
	if l2.counter("bob", "example.com").up.Load() != 13 {
		t.Fatal("cross-user leakage")
	}
	raw, _ := os.ReadFile(path)
	var f usageFile
	if json.Unmarshal(raw, &f) != nil || len(f.Rows) != 2 {
		t.Fatal("bad ledger")
	}
}
func TestUsageOverflowKeepsBytes(t *testing.T) {
	l, _ := newUsageLedger(filepath.Join(t.TempDir(), "usage.json"))
	for i := 0; i < usageMaxEntries; i++ {
		l.entries[string(rune(i))] = &usageCounter{}
	}
	c := l.counter("alice", "new.example")
	c.up.Add(10)
	if l.counter("alice", "another.example") != c || !l.overflow || c.host != "__other__" {
		t.Fatal("overflow does not aggregate")
	}
}

type usageTestReader struct{ mb buf.MultiBuffer }

func (r *usageTestReader) ReadMultiBuffer() (buf.MultiBuffer, error) { return r.mb, nil }

type usageTestWriter struct{ n int64 }

func (w *usageTestWriter) WriteMultiBuffer(mb buf.MultiBuffer) error {
	w.n += int64(mb.Len())
	buf.ReleaseMulti(mb)
	return nil
}
func TestUsageWrappersCountPayload(t *testing.T) {
	c := &usageCounter{}
	b := buf.New()
	b.Write([]byte("hello"))
	r := usageReader{reader: &usageTestReader{buf.MultiBuffer{b}}, c: c}
	mb, err := r.ReadMultiBuffer()
	if err != nil {
		t.Fatal(err)
	}
	sink := &usageTestWriter{}
	w := usageWriter{writer: sink, c: c}
	if err = w.WriteMultiBuffer(mb); err != nil {
		t.Fatal(err)
	}
	if c.up.Load() != 5 || c.down.Load() != 5 || sink.n != 5 {
		t.Fatal("wrong payload accounting")
	}
}

func TestUsageClosedStreamNilBuffers(t *testing.T) {
	c := &usageCounter{}
	recordUsage(c, buf.MultiBuffer{nil}, true)
	recordUsage(c, nil, false)
	if c.up.Load() != 0 || c.down.Load() != 0 {
		t.Fatal("closed stream counted bytes")
	}
}
