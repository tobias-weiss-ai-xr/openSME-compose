// LLM analysis backends — off by default, opt-in via DEV_AGENT_LLM_BACKEND.
// Only ANONYMIZED context is ever sent (dev-agent spec).
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"opensme-dev-agent/internal/checker"
)

// ErrDisabled is returned by every call while the backend is "none".
var ErrDisabled = errors.New("llm analysis disabled (DEV_AGENT_LLM_BACKEND=none)")

// LLM is an opt-in analysis backend.
type LLM struct {
	Backend string
	URL     string
	Key     string
	Model   string
	client  *http.Client
}

// NewLLM returns nil when the backend is "none" (nothing dials out).
func NewLLM(backend, url, key, model string) *LLM {
	if backend == "" || backend == "none" {
		return nil
	}
	return &LLM{Backend: backend, URL: url, Key: key, Model: model,
		client: &http.Client{Timeout: 180 * time.Second}}
}

// Enabled reports whether outbound analysis is configured.
func (l *LLM) Enabled() bool { return l != nil }

// findingContext renders one finding into a compact context blob. It runs
// through the server anonymizer BEFORE any byte leaves the host.
func (s *Server) findingContext(f checker.Finding) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := fmt.Sprintf("container=%s service=%s state=%s health=%s restarts=%d oom=%t symptoms=%s detail=%q",
		f.Container, f.Service, f.State, f.Health, f.RestartCount, f.OOMKilled,
		joinSymptoms(f.Symptoms), f.Detail)
	clean, _ := s.Anonymize(raw)
	return clean
}

// Analyze asks the backend for a root-cause hypothesis for the finding.
func (l *LLM) Analyze(ctx context.Context, s *Server, f checker.Finding) (string, error) {
	if !l.Enabled() {
		return "", ErrDisabled
	}
	if s == nil {
		return "", errors.New("analyze requires a server context")
	}
	prompt := "You are a maintenance assistant for an openSME docker-compose stack. " +
		"Give a one-sentence root-cause hypothesis and one remediation step. Context: " +
		s.findingContext(f)
	switch l.Backend {
	case "ollama":
		return l.ollama(ctx, prompt)
	case "saia", "tud", "openai":
		return l.openaiCompatible(ctx, prompt)
	default:
		return "", fmt.Errorf("unknown backend %q", l.Backend)
	}
}

func (l *LLM) ollama(ctx context.Context, prompt string) (string, error) {
	body, _ := json.Marshal(map[string]any{"model": l.Model, "prompt": prompt, "stream": false})
	return l.post(ctx, l.URL+"/api/generate", body, func(raw []byte) (string, error) {
		var out struct{ Response string }
		if err := json.Unmarshal(raw, &out); err != nil {
			return "", err
		}
		return out.Response, nil
	})
}

func (l *LLM) openaiCompatible(ctx context.Context, prompt string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": l.Model,
		"messages": []map[string]string{{"role": "user", "content": prompt}},
	})
	return l.post(ctx, l.URL+"/chat/completions", body, func(raw []byte) (string, error) {
		var out struct {
			Choices []struct{ Message struct{ Content string } }
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return "", err
		}
		if len(out.Choices) == 0 {
			return "", fmt.Errorf("empty completion")
		}
		return out.Choices[0].Message.Content, nil
	})
}

func (l *LLM) post(ctx context.Context, url string, body []byte, parse func([]byte) (string, error)) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if l.Key != "" {
		req.Header.Set("Authorization", "Bearer "+l.Key) // sent, never logged
	}
	resp, err := l.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm %s: status %d", l.Backend, resp.StatusCode)
	}
	return parse(buf.Bytes())
}

func joinSymptoms(list []string) string {
	out := ""
	for i, s := range list {
		if i > 0 {
			out += ","
		}
		out += s
	}
	return out
}
