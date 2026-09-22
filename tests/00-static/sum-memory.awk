#!/usr/bin/awk -f
# sum-memory.awk — RAM budget gate for the dev-maintenance-bot service.
# Usage: awk -f tests/00-static/sum-memory.awk monitoring/dev-agent.yml
# Sums the deploy.resources.limits.memory of the dev-maintenance-bot service
# block and fails if the total exceeds BUDGET_MB (default 128).
BEGIN { budget = (BUDGET_MB == "" ? 128 : BUDGET_MB); inbot = 0; inlimits = 0; total = 0 }

# service block header: exactly two spaces + name + colon
/^  [a-z0-9_-]+:$/ {
    inbot = ($0 == "  dev-maintenance-bot:")
    inlimits = 0
    next
}

inbot && /^[ ]+limits:/ { inlimits = 1; next }
inbot && /^[ ]+reservations:/ { inlimits = 0; next }

inbot && inlimits && /memory:/ {
    line = $0
    sub(/^.*memory:[ ]*/, "", line)
    sub(/["']/, "", line)
    mb = line
    if (mb ~ /G$/) { gsub(/G/, "", mb); total += mb * 1024 }
    else if (mb ~ /Mi$/) { gsub(/Mi/, "", mb); total += mb }
    else if (mb ~ /M$/) { gsub(/M/, "", mb); total += mb }
    else if (mb ~ /Ki$/) { gsub(/Ki/, "", mb); total += mb / 1024 }
    else { total += mb / (1024 * 1024) } # plain bytes
}

END {
    if (total == 0) { print "ram-budget: dev-maintenance-bot memory limit NOT FOUND" > "/dev/stderr"; exit 1 }
    printf "ram-budget: dev-maintenance-bot = %d MB (budget %d MB): ", total, budget
    if (total <= budget) { print "OK"; exit 0 }
    print "EXCEEDED"; exit 1
}
