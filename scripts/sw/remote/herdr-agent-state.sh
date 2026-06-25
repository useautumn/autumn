#!/bin/sh
# sw remote agent-status hook. herdr can't detect a remote agent by process name
# (over ssh the pane's process is `ssh`, not `claude`), so we report state via
# `pane.report_agent` with a NON-native source (`sw:claude`). That hits herdr's
# set_hook_authority path (a `herdr:claude` source would only update the session
# ref), making the ssh'd claude appear in the agents sidebar with live status.
#
# Wired (by provision) to SessionStart / UserPromptSubmit / Stop / Notification;
# the event name comes in on stdin, not argv.
set -eu

hook_input_file="$(mktemp "${TMPDIR:-/tmp}/sw-claude-hook.XXXXXX")" || exit 0
trap 'rm -f "$hook_input_file"' EXIT HUP INT TERM
cat >"$hook_input_file" 2>/dev/null || true

[ "${HERDR_ENV:-}" = "1" ] || exit 0
[ -n "${HERDR_SOCKET_PATH:-}" ] || exit 0
[ -n "${HERDR_PANE_ID:-}" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

HERDR_HOOK_INPUT_FILE="$hook_input_file" python3 - <<'PY'
import json, os, random, socket, time

pane = os.environ.get("HERDR_PANE_ID")
sock = os.environ.get("HERDR_SOCKET_PATH")
if not pane or not sock:
    raise SystemExit(0)

hook_input = {}
try:
    with open(os.environ["HERDR_HOOK_INPUT_FILE"], encoding="utf-8") as handle:
        content = handle.read()
    if content.strip():
        hook_input = json.loads(content)
except Exception:
    hook_input = {}

if hook_input.get("agent_id"):  # a subagent, not the main session
    raise SystemExit(0)

event = str(hook_input.get("hook_event_name") or "")
if event == "SubagentStop":
    raise SystemExit(0)

# Map a Claude Code hook event to a herdr agent state.
state = {
    "UserPromptSubmit": "working",
    "Stop": "idle",
    "Notification": "blocked",
    "SessionStart": "idle",
}.get(event, "idle")

session_id = hook_input.get("session_id")
transcript = hook_input.get("transcript_path")
params = {
    "pane_id": pane,
    "source": "sw:claude",  # non-native → set_hook_authority → visible in sidebar
    "agent": "claude",
    "state": state,
    "seq": time.time_ns(),
}
if isinstance(session_id, str) and session_id:
    params["agent_session_id"] = session_id
if isinstance(transcript, str) and transcript:
    params["agent_session_path"] = transcript

request = {
    "id": f"sw:{int(time.time() * 1000)}:{random.randrange(1_000_000):06d}",
    "method": "pane.report_agent",
    "params": params,
}
try:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(0.5)
    client.connect(sock)
    client.sendall((json.dumps(request) + "\n").encode())
    try:
        client.recv(4096)
    except Exception:
        pass
    client.close()
except Exception:
    pass
PY
