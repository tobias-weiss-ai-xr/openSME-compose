package checker

import (
	"context"
	"os/exec"
	"time"
)

// runCLI executes the docker binary. Callers must have allowlisted the
// subcommand (see CLIRunner.Run). A per-command timeout keeps the checker
// from stalling on an unreachable daemon.
func runCLI(ctx context.Context, args ...string) (string, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
	}
	out, err := exec.CommandContext(ctx, "docker", args...).Output()
	if err != nil {
		return string(out), err
	}
	return string(out), nil
}
