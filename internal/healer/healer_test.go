package healer

import (
	"context"
	"strings"
	"testing"
	"time"
)

type recordingRunner struct {
	calls [][]string
}

func (r *recordingRunner) Run(ctx context.Context, args ...string) (string, error) {
	r.calls = append(r.calls, args)
	return "restarted", nil
}

func TestDryRunNoOp(t *testing.T) {
	r := &recordingRunner{}
	h := New(false, r)
	rc := h.Execute(context.Background(), ActionRestart, "opensme-sogo-1")
	if rc.Executed {
		t.Error("dry-run must not execute")
	}
	if !strings.Contains(rc.Output, "dry-run") || !strings.Contains(rc.Output, "docker restart opensme-sogo-1") {
		t.Errorf("receipt output = %q", rc.Output)
	}
	if len(r.calls) != 0 {
		t.Errorf("runner called %d times in dry-run", len(r.calls))
	}
}

func TestAllowHealExecutes(t *testing.T) {
	r := &recordingRunner{}
	h := New(true, r)
	rc := h.Execute(context.Background(), ActionRestart, "opensme-sogo-1")
	if !rc.Executed || rc.Error != "" || rc.Output != "restarted" {
		t.Errorf("receipt = %+v", rc)
	}
	if len(r.calls) != 1 || r.calls[0][0] != "restart" || r.calls[0][1] != "opensme-sogo-1" {
		t.Errorf("calls = %v", r.calls)
	}
	if time.Since(rc.Time) > time.Minute {
		t.Error("receipt timestamp not recent")
	}
}

func TestPruneNeverExecutes(t *testing.T) {
	r := &recordingRunner{}
	h := New(true, r)
	rc := h.Execute(context.Background(), ActionPrune, "")
	if rc.Executed {
		t.Error("prune must never execute (dry-run only policy)")
	}
	if len(r.calls) != 0 {
		t.Errorf("prune called runner: %v", r.calls)
	}
}

func TestInvalidTargetRejected(t *testing.T) {
	h := New(true, &recordingRunner{})
	for _, tgt := range []string{"a; rm -rf /", "x y", "", "-evil"} {
		rc := h.Execute(context.Background(), ActionRestart, tgt)
		if rc.Executed || rc.Error == "" {
			t.Errorf("target %q must be rejected, got %+v", tgt, rc)
		}
	}
}

func TestUnknownAction(t *testing.T) {
	h := New(true, &recordingRunner{})
	rc := h.Execute(context.Background(), "reboot", "x")
	if rc.Executed || rc.Error == "" {
		t.Errorf("unknown action must be rejected: %+v", rc)
	}
}
