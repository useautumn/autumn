// The claude-code bridge binds one TCP port; the harness reads ports[0] as the
// bridge port. E2B's getHost(port) resolves any bound port to a public host.
export const E2B_BRIDGE_PORT = 4000;

// Total sandbox lifetime (E2B timeout is wall-clock, not idle). Must exceed the
// message budget so the VM isn't reaped mid-turn; the tail is the warm window.
export const E2B_SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

// The bridge install + running claude need headroom; default E2B sandbox is small.
export const E2B_RESOURCES = { cpuCount: 2, memoryMB: 4096 } as const;

// Metadata key used to find a session's sandbox on resume (E2B has no name lookup).
export const E2B_SESSION_METADATA_KEY = "leafSessionId";

// Custom-template name prefix; the recipe-identity hash is appended so a bridge
// change forks a fresh template.
export const E2B_TEMPLATE_PREFIX = "leaf-claude-bridge";
