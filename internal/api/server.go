// Package api serves the dev-agent REST surface (GET /status, /healthz,
// /ready, /history, /evidence; POST /heal) and owns the strip-then-review
// anonymizer (dev-agent-privacy spec).
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"opensme-dev-agent/internal/checker"
	"opensme-dev-agent/internal/config"
	"opensme-dev-agent/internal/healer"
	"opensme-dev-agent/internal/knowledge"
)

// EvidenceEntry is one auditable record: either an anonymizer strip
// operation or a heal action. Raw values NEVER enter this log.
type EvidenceEntry struct {
	Time  time.Time `json:"time"`
	Kind  string    `json:"kind"` // "strip" | "heal"
	What  string    `json:"what"`
	Where string    `json:"where"`
	Why   string    `json:"why"`
}

// StripRecord describes one anonymizer replacement (no raw values).
type StripRecord struct {
	What  string
	Where string
	Why   string
}

// Server is the agent's HTTP surface and reconcile state.
type Server struct {
	cfg   *config.Config
	kb    *knowledge.Store
	chk   *checker.Checker
	heal  *healer.Healer
	llm   *LLM
	mu    sync.Mutex
	start time.Time

	containers []checker.Finding
	matches    map[string][]knowledge.Match
	history    []healer.Receipt
	evidence   []EvidenceEntry
	checked    bool
}

// New wires the server. It loads persisted history/evidence from the state
// dir if present.
func New(cfg *config.Config, kb *knowledge.Store, chk *checker.Checker, hl *healer.Healer, llm *LLM) (*Server, error) {
	s := &Server{cfg: cfg, kb: kb, chk: chk, heal: hl, llm: llm, start: time.Now().UTC(), matches: map[string][]knowledge.Match{}}
	s.load()
	return s, nil
}

// Handler returns the HTTP mux (private, compose-network only).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/ready", s.handleReady)
	mux.HandleFunc("/history", s.handleHistory)
	mux.HandleFunc("/evidence", s.handleEvidence)
	mux.HandleFunc("/heal", s.handleHeal)
	return mux
}

// Reconcile runs one check pass: classify containers, match knowledge,
// optionally send ANONYMIZED context to the LLM, persist state.
func (s *Server) Reconcile(ctx context.Context) error {
	findings, err := s.chk.Inspect(ctx)
	if err != nil {
		return err
	}
	// Log samples may contain secrets — strip BEFORE anything is stored or served.
	for i := range findings {
		if findings[i].Detail != "" {
			findings[i].Detail, _ = s.Anonymize(findings[i].Detail)
		}
	}
	s.mu.Lock()
	s.containers = findings
	s.matches = map[string][]knowledge.Match{}
	s.mu.Unlock()

	for _, f := range findings {
		for _, sym := range f.Symptoms {
			for _, m := range s.kb.MatchSymptom(sym) {
				s.addMatch(f.Service, m)
			}
		}
		// LLM analysis: opt-in only, anonymized only.
		if s.llm != nil && s.llm.Enabled() {
			analysis, err := s.llm.Analyze(ctx, s, f)
			if err != nil {
				s.addEvidence(EvidenceEntry{Time: time.Now().UTC(), Kind: "strip",
					What: "llm analysis error", Where: f.Container, Why: err.Error()})
				continue
			}
			s.addMatch(f.Service, knowledge.Match{Service: f.Service, Runbook: knowledge.Runbook{
				Symptoms: f.Symptoms, Diagnosis: "llm: " + analysis,
			}})
		}
	}
	s.mu.Lock()
	s.checked = true
	s.mu.Unlock()
	return s.Save()
}

func (s *Server) addMatch(service string, m knowledge.Match) {
	s.mu.Lock()
	s.matches[service] = append(s.matches[service], m)
	s.mu.Unlock()
}

func (s *Server) addEvidence(e EvidenceEntry) {
	s.mu.Lock()
	s.evidence = append(s.evidence, e)
	s.mu.Unlock()
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"started_at":   s.start,
		"config":       s.cfg.String(),
		"containers":   s.containers,
		"matches":      s.matches,
		"kb_services":  s.kb.Services(),
		"history_size": len(s.history),
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	ready := s.checked
	s.mu.Unlock()
	if !ready {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "no reconcile yet"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) handleHistory(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	writeJSON(w, http.StatusOK, s.history)
}

func (s *Server) handleEvidence(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	writeJSON(w, http.StatusOK, s.evidence)
}

// healRequest is the POST /heal body.
type healRequest struct {
	Action string `json:"action"`
	Target string `json:"target"`
}

func (s *Server) handleHeal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	var req healRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	rc := s.heal.Execute(r.Context(), req.Action, req.Target)
	s.mu.Lock()
	s.history = append(s.history, rc)
	s.evidence = append(s.evidence, EvidenceEntry{
		Time: rc.Time, Kind: "heal",
		What:  fmt.Sprintf("action=%s executed=%t", rc.Action, rc.Executed),
		Where: rc.Target, Why: rc.Output,
	})
	s.mu.Unlock()
	_ = s.Save()
	writeJSON(w, http.StatusOK, rc)
}

// ListenAndServe starts the private API; blocks until ctx is done.
func (s *Server) ListenAndServe(ctx context.Context) error {
	srv := &http.Server{Addr: s.cfg.APIAddr, Handler: s.Handler(), ReadHeaderTimeout: 5 * time.Second}
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return srv.Shutdown(shutCtx)
	case err := <-errCh:
		return err
	}
}

// --- persistence (dev-agent spec: SIGTERM persists history) ---

type persisted struct {
	History  []healer.Receipt `json:"history"`
	Evidence []EvidenceEntry  `json:"evidence"`
}

func (s *Server) stateFile() string { return filepath.Join(s.cfg.StateDir, "state.json") }

// Save writes history+evidence to the state dir (best effort).
func (s *Server) Save() error {
	if err := os.MkdirAll(s.cfg.StateDir, 0o700); err != nil {
		return fmt.Errorf("state dir: %w", err)
	}
	s.mu.Lock()
	p := persisted{History: s.history, Evidence: s.evidence}
	s.mu.Unlock()
	raw, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.stateFile(), raw, 0o600)
}

func (s *Server) load() {
	raw, err := os.ReadFile(s.stateFile())
	if err != nil {
		return
	}
	var p persisted
	if json.Unmarshal(raw, &p) != nil {
		return
	}
	s.history, s.evidence = p.History, p.Evidence
}

// PrintStatus renders the current persisted status (used by `agent -status`).
func (s *Server) PrintStatus() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var b strings.Builder
	fmt.Fprintf(&b, "started_at: %s\nconfig: %s\n", s.start.Format(time.RFC3339), s.cfg.String())
	fmt.Fprintf(&b, "containers: %d findings, history: %d\n", len(s.containers), len(s.history))
	for _, f := range s.containers {
		fmt.Fprintf(&b, "  UNHEALTHY %s (%s): %s\n", f.Container, f.State, strings.Join(f.Symptoms, ", "))
	}
	for svc, ms := range s.matches {
		for _, m := range ms {
			fmt.Fprintf(&b, "  KB[%s] %s → %s\n", svc, strings.Join(m.Runbook.Symptoms, "|"), firstLine(m.Runbook.Diagnosis))
		}
	}
	return b.String()
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// --- anonymizer (dev-agent-privacy: strip-then-review) ---

var (
	reSecret = regexp.MustCompile(`(?i)\b((?:api[_-]?key|apikey|key|token|secret|password|passwd|authorization|bearer)["']?\s*[:=]\s*"?)[^\s"',}]+`)
	reIPv4   = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	reHome   = regexp.MustCompile(`/home/[a-zA-Z0-9_.-]+|/Users/[a-zA-Z0-9_.-]+|/root\b`)
	reHost   = regexp.MustCompile(`\b[a-z0-9][a-z0-9-]{2,}\.(?:local|internal|home\.arpa|lan)\b`)
)

// Anonymize strips secrets, IPs, hostnames and user paths from raw, returning
// the cleaned string plus one StripRecord per category that fired. Raw
// values are never retained anywhere.
func (s *Server) Anonymize(raw string) (string, []StripRecord) {
	var rec []StripRecord
	add := func(what, why string) {
		rec = append(rec, StripRecord{What: what, Where: "llm-context", Why: why})
	}
	out := reSecret.ReplaceAllString(raw, `${1}***`)
	if out != raw {
		add("secret value", "credentials must not leave the host")
	}
	clean := reIPv4.ReplaceAllString(out, "<ip>")
	if clean != out {
		add("ip address", "network topology is private")
	}
	prev := clean
	clean = reHome.ReplaceAllString(clean, "/home/<user>")
	if clean != prev {
		add("user path", "user identity is private")
	}
	hosts := s.cfg.Hostnames
	for _, h := range hosts {
		clean = strings.ReplaceAll(clean, h, "<host>")
	}
	clean = reHost.ReplaceAllString(clean, "<host>")
	if clean != prev {
		add("hostname", "host identity is private")
	}
	for _, r := range rec {
		s.addEvidence(EvidenceEntry{Time: time.Now().UTC(), Kind: "strip", What: r.What, Where: r.Where, Why: r.Why})
	}
	return clean, rec
}
