// opensme-dev-agent — small maintenance bot for the openSME compose
// stack: runbook knowledge, read-only docker checks, consent-gated healing,
// private REST API, opt-in anonymized LLM analysis.
package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"opensme-dev-agent/internal/api"
	"opensme-dev-agent/internal/checker"
	"opensme-dev-agent/internal/config"
	"opensme-dev-agent/internal/healer"
	"opensme-dev-agent/internal/knowledge"
)

//go:embed opensme-knowledge
var kbFS embed.FS

func main() {
	once := flag.Bool("once", false, "run a single reconcile pass and exit (compose one-shot)")
	serve := flag.Bool("serve", false, "run the reconcile loop and serve the private API (the default)")
	status := flag.Bool("status", false, "print persisted status from the state dir and exit")
	flag.Parse()
	if *once && *serve {
		fatal(fmt.Errorf("-once and -serve are mutually exclusive"))
	}

	cfg, err := config.FromEnv()
	if err != nil {
		fatal(err)
	}

	if *status {
		printPersistedStatus(cfg)
		return
	}

	kb, err := knowledge.Load(kbFS, "opensme-knowledge")
	if err != nil {
		fatal(err)
	}
	chk := checker.New(cfg.Watch, nil)
	hl := healer.New(cfg.AllowHeal, nil)
	var llm *api.LLM
	if cfg.LLM.Backend != "none" {
		llm = api.NewLLM(cfg.LLM.Backend, cfg.LLM.URL, cfg.LLM.Key, cfg.LLM.Model)
	}
	srv, err := api.New(cfg, kb, chk, hl, llm)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("dev-agent: %s\n", cfg.String())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if *once {
		if err := srv.Reconcile(ctx); err != nil {
			fatal(err)
		}
		fmt.Print(srv.PrintStatus())
		return // exit cleanly — compose restart: "no"
	}

	// Serve mode: reconcile immediately, then loop/signal.
	if err := srv.Reconcile(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "dev-agent: initial reconcile: %v\n", err)
	}
	go tickerLoop(ctx, srv, cfg.Interval)
	err = srv.ListenAndServe(ctx)
	_ = srv.Save() // SIGTERM persists history before exit
	if err != nil && ctx.Err() == nil {
		fatal(err)
	}
}

// tickerLoop reconciles on every interval tick until ctx is done.
func tickerLoop(ctx context.Context, srv *api.Server, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := srv.Reconcile(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "dev-agent: reconcile: %v\n", err)
			}
		}
	}
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "dev-agent: %v\n", err)
	os.Exit(1)
}

func printPersistedStatus(cfg *config.Config) {
	// Minimal: load state file via a throwaway server.
	kb, err := knowledge.Load(kbFS, "opensme-knowledge")
	if err != nil {
		fatal(err)
	}
	srv, err := api.New(cfg, kb, checker.New(cfg.Watch, nil), healer.New(cfg.AllowHeal, nil), nil)
	if err != nil {
		fatal(err)
	}
	fmt.Print(srv.PrintStatus())
}
