// Package checker classifies openSME containers as healthy/unhealthy
// via the docker CLI over a READ-ONLY docker socket (dev-agent spec: only
// `docker ps`, `docker inspect`, `docker logs`, `docker stats` are ever run).
package checker

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// errorSpike is the number of error-ish log lines (in the tail) that counts
// as a symptom.
const errorSpike = 5

// errorPatterns are the substrings (lowercase) that count as error-ish.
// Expanded beyond error/fatal/panic to catch real-world log patterns:
// connection refusals, failures, denials, timeouts, exceptions, etc.
var errorPatterns = []string{
	"error", "fatal", "panic", "critical",
	"failed", "failure", "denied", "refused",
	"timeout", "timed out", "exception",
	"unable to", "cannot", "permission denied",
}

// memHighThreshold is the memory usage percentage above which a container
// is flagged as about-to-OOM (proactive, before the kernel kills it).
const memHighThreshold = 90.0 // percent

// Finding is one unhealthy container with its detected symptoms.
type Finding struct {
	Container    string    `json:"container"`
	Service      string    `json:"service"`
	Project      string    `json:"project"`
	State        string    `json:"state"`
	Health       string    `json:"health,omitempty"`
	RestartCount int       `json:"restart_count"`
	OOMKilled    bool      `json:"oom_killed"`
	MemPct       float64   `json:"mem_pct,omitempty"` // docker stats memory usage %
	CPUPct       float64   `json:"cpu_pct,omitempty"` // docker stats CPU usage %
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
		// Proactive OOM prediction: flag containers near memory limit even
		// if not yet OOM-killed. docker stats --no-stream gives instantaneous
		// usage. We only call this for already-unhealthy containers to keep
		// the read-only command count bounded.
		if cpu, mem, ok := c.memStats(ctx, p.Names); ok && mem >= memHighThreshold {
			f.MemPct = mem
			f.CPUPct = cpu
			f.Symptoms = append(f.Symptoms, "memory near limit")
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
		for _, p := range errorPatterns {
			if strings.Contains(low, p) {
				n++
				if sample == "" {
					sample = ln
				}
				break
			}
		}
	}
	return n >= errorSpike, sample
}

// memStats returns CPU% and memory% from `docker stats --no-stream` for a
// container. Returns ok=false if stats are unavailable or unparseable.
func (c *Checker) memStats(ctx context.Context, name string) (cpu, mem float64, ok bool) {
	out, err := c.runner.Run(ctx, "stats", "--no-stream", "--format", "{{.CPUPerc}}\t{{.MemPerc}}", name)
	if err != nil {
		return 0, 0, false
	}
	fields := strings.Fields(strings.TrimSpace(out))
	if len(fields) < 2 {
		return 0, 0, false
	}
	cpu = parsePercent(fields[0])
	mem = parsePercent(fields[1])
	return cpu, mem, mem > 0
}

// parsePercent strips the trailing % from a docker stats value and parses
// the float.
func parsePercent(s string) float64 {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	f, _ := strconv.ParseFloat(s, 64)
	return f
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
