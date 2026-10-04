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

func has(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
