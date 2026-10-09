package checker

import (
	"context"
	"strings"
	"testing"
)

// fakeRunner serves canned docker output and records every invocation.
type fakeRunner struct {
	allow  map[string]bool
	output map[string]string
	calls  [][]string
}

func (f *fakeRunner) Run(ctx context.Context, args ...string) (string, error) {
	f.calls = append(f.calls, args)
	return f.output[args[0]], nil
}

func psJSON(name, state, project, service, status string) string {
	return `{"Names":"` + name + `","State":"` + state + `","Status":"` + status + `","Labels":"com.docker.compose.project=` + project + `,com.docker.compose.service=` + service + `"}`
}

func TestRestartingDetected(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("opensme-stalwart-1", "restarting", "opensme", "stalwart", "Restarting (1) 5 seconds ago") + "\n",
		"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":4}`,
		"logs":    "stalwart listener started\n",
	}}
	c := New([]string{"opensme"}, f)
	findings, err := c.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings = %d, want 1", len(findings))
	}
	fd := findings[0]
	if fd.Container != "opensme-stalwart-1" || fd.RestartCount != 4 {
		t.Errorf("finding = %+v", fd)
	}
	if !has(fd.Symptoms, "restarting") {
		t.Errorf("symptoms = %v, want restarting", fd.Symptoms)
	}
}

func TestExitedWithRestartsDetected(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "exited", "opensme", "sogo", "Exited (137) 2 minutes ago") + "\n",
		"inspect": `{"Restarting":false,"OOMKilled":false,"RestartCount":3}`,
		"logs":    "",
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 1 || !has(findings[0].Symptoms, "exited with restarts") {
		t.Fatalf("findings = %+v", findings)
	}
}

func TestHealthyIgnored(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "running", "opensme", "postgres", "Up 2 hours") + "\n",
		"inspect": `{"Restarting":false,"OOMKilled":false,"RestartCount":0,"Health":{"Status":"healthy"}}`,
		"logs":    "",
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 0 {
		t.Errorf("healthy container reported: %+v", findings)
	}
}

func TestOOMAndHealthDetected(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "running", "opensme", "postgres", "Up 2 minutes") + "\n",
		"inspect": `{"Restarting":false,"OOMKilled":true,"RestartCount":0,"Health":{"Status":"unhealthy"}}`,
		"logs":    "",
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 1 {
		t.Fatalf("findings = %+v", findings)
	}
	if !has(findings[0].Symptoms, "oom killed") || !has(findings[0].Symptoms, "healthcheck unhealthy") {
		t.Errorf("symptoms = %v", findings[0].Symptoms)
	}
}

func TestWatchFilterAndLogSpike(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps": psJSON("in", "restarting", "opensme", "traefik", "Restarting (2) 1 minute ago") + "\n" +
			psJSON("out", "restarting", "other", "web", "Restarting") + "\n",
		"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":2}`,
		"logs":    strings.Repeat("ERROR something failed\n", 6),
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 1 || findings[0].Container != "in" {
		t.Fatalf("watch filter failed: %+v", findings)
	}
	if !has(findings[0].Symptoms, "log error spike") {
		t.Errorf("log spike missed: %v", findings[0].Symptoms)
	}
}

func TestReadOnlyAllowlist(t *testing.T) {
	for _, cmd := range []string{"ps", "inspect", "logs", "stats"} {
		if err := allowlist(cmd); err != nil {
			t.Errorf("%s must be allowed: %v", cmd, err)
		}
	}
	for _, cmd := range []string{"restart", "rm", "kill", "stop", "exec", "system"} {
		if err := allowlist(cmd); err == nil {
			t.Errorf("%s must be rejected by the checker allowlist", cmd)
		}
	}
	if err := allowlist(); err == nil {
		t.Error("empty command must be rejected")
	}
}

func TestExpandedErrorPatterns(t *testing.T) {
	// The expanded error pattern set must catch real-world log lines that
	// the old error/fatal/panic-only matcher missed.
	cases := []struct{ log, sym string }{
		{"connection refused", "log error spike"},
		{"operation failed", "log error spike"},
		{"access denied", "log error spike"},
		{"request timeout", "log error spike"},
		{"nil pointer exception", "log error spike"},
		{"unable to bind", "log error spike"},
		{"cannot connect", "log error spike"},
		{"permission denied", "log error spike"},
		{"critical: disk full", "log error spike"},
		{"INFO: all good", ""}, // info lines must NOT trigger
	}
	for _, tc := range cases {
		f := &fakeRunner{output: map[string]string{
			"ps":      psJSON("c1", "restarting", "opensme", "svc", "Restarting") + "\n",
			"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":1}`,
			"logs":    strings.Repeat(tc.log+"\n", 6),
		}}
		c := New([]string{"opensme"}, f)
		findings, _ := c.Inspect(context.Background())
		var got string
		if len(findings) > 0 && has(findings[0].Symptoms, "log error spike") {
			got = "log error spike"
		}
		if got != tc.sym {
			t.Errorf("log %q: got %q, want %q", tc.log, got, tc.sym)
		}
	}
}

func TestMemStatsParsing(t *testing.T) {
	// docker stats --no-stream --format outputs "0.50%\t12.30%"
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "running", "opensme", "postgres", "Up 2 minutes") + "\n",
		"inspect": `{"Restarting":false,"OOMKilled":true,"RestartCount":0,"Health":{"Status":"unhealthy"}}`,
		"logs":    "",
		"stats":   "0.50%\t95.30%\n",
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 1 {
		t.Fatalf("findings = %d, want 1", len(findings))
	}
	if !has(findings[0].Symptoms, "memory near limit") {
		t.Errorf("expected 'memory near limit' symptom, got %v", findings[0].Symptoms)
	}
	if findings[0].MemPct < 95.0 {
		t.Errorf("MemPct = %.1f, want >= 95.0", findings[0].MemPct)
	}
}

func TestMemStatsBelowThreshold(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "running", "opensme", "postgres", "Up 2 minutes") + "\n",
		"inspect": `{"Restarting":false,"OOMKilled":true,"RestartCount":0,"Health":{"Status":"unhealthy"}}`,
		"logs":    "",
		"stats":   "0.50%\t42.00%\n",
	}}
	c := New([]string{"opensme"}, f)
	findings, _ := c.Inspect(context.Background())
	if len(findings) != 1 {
		t.Fatalf("findings = %d, want 1", len(findings))
	}
	if has(findings[0].Symptoms, "memory near limit") {
		t.Errorf("should NOT have 'memory near limit' at 42%%, got %v", findings[0].Symptoms)
	}
}

func TestStatsUsesReadOnlyCommand(t *testing.T) {
	// stats must be in the read-only allowlist (already tested), but verify
	// the checker actually calls stats (not just that it's allowed).
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("c1", "restarting", "opensme", "svc", "Restarting") + "\n",
		"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":1}`,
		"logs":    "",
		"stats":   "0.00%\t99.00%\n",
	}}
	c := New([]string{"opensme"}, f)
	_, _ = c.Inspect(context.Background())
	found := false
	for _, call := range f.calls {
		if len(call) > 0 && call[0] == "stats" {
			found = true
		}
	}
	if !found {
		t.Error("checker never called docker stats")
	}
}

func has(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Regression: the compose project name is "opensme-compose" (not "opensme").
// Inspect() filters on an EXACT match of com.docker.compose.project, so a
// wrong watch default silently matches zero containers — the health bot
// would never see anything to remediate. This locks in that the real label
// is found when watched by its exact name.
func TestRealComposeProjectNameMatchesWatch(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("opensme-stalwart-1", "restarting", "opensme-compose", "stalwart", "Restarting (1) 5 seconds ago") + "\n",
		"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":2}`,
		"logs":    "stalwart listener started\n",
	}}
	c := New([]string{"opensme-compose"}, f)
	findings, err := c.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 1 {
		t.Fatalf("findings = %d, want 1 (watch must match the real project label)", len(findings))
	}
}

// And the corollary that makes the old default silently useless: watching
// the bare "opensme" prefix does NOT match the hyphenated "opensme-compose"
// project — so the default watch must be the full project name.
func TestWrongDefaultPrefixDoesNotMatchRealProject(t *testing.T) {
	f := &fakeRunner{output: map[string]string{
		"ps":      psJSON("opensme-stalwart-1", "restarting", "opensme-compose", "stalwart", "Restarting (1) 5 seconds ago") + "\n",
		"inspect": `{"Restarting":true,"OOMKilled":false,"RestartCount":2}`,
		"logs":    "stalwart listener started\n",
	}}
	c := New([]string{"opensme"}, f)
	findings, err := c.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) != 0 {
		t.Fatalf("findings = %d, want 0 (exact-match: 'opensme' must not match 'opensme-compose')", len(findings))
	}
}
