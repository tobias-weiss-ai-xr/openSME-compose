// Package checker classifies openSME containers as healthy/unhealthy
// via the docker CLI over a READ-ONLY docker socket (dev-agent spec: only
// `docker ps`, `docker inspect`, `docker logs`, `docker stats` are ever run).
package checker

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// errorSpike is the number of error-ish log lines (in the tail) that counts
// as a symptom.
const errorSpike = 5

// Finding is one unhealthy container with its detected symptoms.
type Finding struct {
	Container    string    `json:"container"`
	Service      string    `json:"service"`
	Project      string    `json:"project"`
	State        string    `json:"state"`
	Health       string    `json:"health,omitempty"`
	RestartCount int       `json:"restart_count"`
	OOMKilled    bool      `json:"oom_killed"`
	Symptoms     []string  `json:"symptoms"`
	Detail       string    `json:"detail,omitempty"`
	Seen         time.Time `json:"seen"`
}

// Runner executes a docker CLI invocation. Implementations MUST enforce the
// read-only command allowlist.
type Runner interface {
	Run(ctx context.Context, args ...string) (string, error)
}

// readOnlyCommands is the allowlist enforced by CLIRunner.
var readOnlyCommands = map[string]bool{"ps": true, "inspect": true, "logs": true, "stats": true}

// CLIRunner runs the real docker binary; it rejects anything not on the
// read-only allowlist.
type CLIRunner struct{}

// Run implements Runner.
func (CLIRunner) Run(ctx context.Context, args ...string) (string, error) {
	if err := allowlist(args...); err != nil {
		return "", err
	}
	return runCLI(ctx, args...) // in exec.go
}

// allowlist enforces the read-only command policy.
func allowlist(args ...string) error {
	if len(args) == 0 || !readOnlyCommands[args[0]] {
		return fmt.Errorf("checker: command %v rejected (read-only socket: only ps/inspect/logs/stats allowed)", args)
	}
	return nil
}

// Checker watches a set of compose projects.
type Checker struct {
	watch  map[string]bool
	runner Runner
}

// New creates a Checker watching the given compose project names.
func New(watch []string, r Runner) *Checker {
	if r == nil {
		r = CLIRunner{}
	}
	c := &Checker{watch: map[string]bool{}, runner: r}
	for _, w := range watch {
		c.watch[strings.TrimSpace(w)] = true
	}
	return c
}

// psLine is one record of `docker ps -a --format {{json .}}`.
type psLine struct {
	Names  string `json:"Names"`
	State  string `json:"State"`
	Status string `json:"Status"`
	// Labels is a flat "k=v,k=v" string in docker ps JSON output.
	Labels       string `json:"Labels"`
	HealthStatus string `json:"HealthStatus"`
}

// label parses one compose label out of the flat Labels string.
func (p psLine) label(key string) string {
	for _, kv := range strings.Split(p.Labels, ",") {
		if i := strings.IndexByte(kv, '='); i > 0 && kv[:i] == key {
			return kv[i+1:]
		}
	}
	return ""
}

type inspectState struct {
	Restarting   bool `json:"Restarting"`
	OOMKilled    bool `json:"OOMKilled"`
	RestartCount int  `json:"RestartCount"`
	Health       *struct {
		Status string `json:"Status"`
	} `json:"Health,omitempty"`
}

// Inspect returns one Finding per watched container that classifies as
// unhealthy. Read commands only.
func (c *Checker) Inspect(ctx context.Context) ([]Finding, error) {
	out, err := c.runner.Run(ctx, "ps", "-a", "--format", "{{json .}}")
	if err != nil {
		return nil, fmt.Errorf("docker ps: %w", err)
	}
	var findings []Finding
	now := time.Now().UTC()
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var p psLine
		if err := json.Unmarshal([]byte(line), &p); err != nil {
			continue // skip non-JSON noise
		}
		if len(c.watch) > 0 && !c.watch[p.label("com.docker.compose.project")] {
			continue
		}
		f := Finding{
			Container: p.Names, Service: p.label("com.docker.compose.service"), Project: p.label("com.docker.compose.project"),
			State: p.State, Seen: now,
		}
		insp, err := c.inspectState(ctx, p.Names)
		if err == nil {
			f.RestartCount = insp.RestartCount
			f.OOMKilled = insp.OOMKilled
			if insp.Health != nil {
				f.Health = insp.Health.Status
			}
		} else if strings.EqualFold(p.HealthStatus, "unhealthy") {
			// inspect failed (e.g. container gone) — fall back to ps health
			f.Health = "unhealthy"
		}
		f.Symptoms = classify(f)
		if len(f.Symptoms) == 0 {
			continue
		}
		if spike, detail := c.logSpike(ctx, p.Names); spike {
			f.Symptoms = append(f.Symptoms, "log error spike")
			f.Detail = detail
		}
		findings = append(findings, f)
	}
	sort.Slice(findings, func(i, j int) bool { return findings[i].Container < findings[j].Container })
	return findings, nil
}

func (c *Checker) inspectState(ctx context.Context, name string) (*inspectState, error) {
	out, err := c.runner.Run(ctx, "inspect", "--format", "{{json .State}}", name)
	if err != nil {
		return nil, err
	}
	var st inspectState
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &st); err != nil {
		return nil, err
	}
	return &st, nil
}

// logSpike reports whether the container's recent logs contain an error
// spike. Returns the matched sample (single line, for context).
func (c *Checker) logSpike(ctx context.Context, name string) (bool, string) {
	out, err := c.runner.Run(ctx, "logs", "--tail", "50", name)
	if err != nil {
		return false, ""
	}
	n := 0
	sample := ""
	for _, ln := range strings.Split(out, "\n") {
		low := strings.ToLower(ln)
		if strings.Contains(low, "error") || strings.Contains(low, "fatal") || strings.Contains(low, "panic") {
			n++
			if sample == "" {
				sample = ln
			}
		}
	}
	return n >= errorSpike, sample
}

// classify produces the symptom list from state fields (pure — unit-tested
// without docker).
func classify(f Finding) []string {
	var sym []string
	state := strings.ToLower(f.State)
	if state == "restarting" {
		sym = append(sym, "restarting")
	}
	if state == "exited" && f.RestartCount > 0 {
		sym = append(sym, "exited with restarts")
	}
	if f.OOMKilled {
		sym = append(sym, "oom killed")
	}
	if strings.ToLower(f.Health) == "unhealthy" {
		sym = append(sym, "healthcheck unhealthy")
	}
	return sym
}
