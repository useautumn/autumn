---
description: "d3k assistant for debugging web apps"
---

# d3k Commands

d3k captures browser and server logs in a unified log file. Use these commands:

## Viewing Errors and Logs

```bash
d3k errors              # Show recent errors (browser + server combined)
d3k errors --context    # Show errors + user actions that preceded them
d3k errors -n 20        # Show last 20 errors

d3k logs                # Show recent logs (browser + server combined)
d3k logs --type browser # Browser logs only
d3k logs --type server  # Server logs only
```

## Other Commands

```bash
d3k fix                 # Deep analysis of application errors
d3k fix --focus build   # Focus on build errors

d3k crawl               # Discover app URLs
d3k crawl --depth all   # Exhaustive crawl

d3k find-component "nav"  # Find React component source

d3k restart             # Restart dev server (rarely needed)
```

## Browser Interaction

To click elements, navigate, or take screenshots, use `d3k agent-browser --cdp $(d3k cdp-port)`:

```bash
d3k agent-browser --cdp $(d3k cdp-port) open http://localhost:3000/page
d3k agent-browser --cdp $(d3k cdp-port) snapshot -i    # Get element refs (@e1, @e2)
d3k agent-browser --cdp $(d3k cdp-port) click @e2
d3k agent-browser --cdp $(d3k cdp-port) fill @e3 "text"
d3k agent-browser --cdp $(d3k cdp-port) screenshot /tmp/shot.png
```

## Fix Workflow

1. `d3k errors --context` - See errors and what triggered them
2. Fix the code
3. `d3k agent-browser --cdp $(d3k cdp-port) open <url>` then `click @e1` to replay
4. `d3k errors` - Verify fix worked
