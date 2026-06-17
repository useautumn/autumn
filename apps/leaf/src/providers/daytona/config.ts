// The claude-code bridge binds one TCP port and the harness reads ports[0] as the
// bridge port. Daytona preview URLs resolve any bound port, so one is enough.
export const DAYTONA_BRIDGE_PORT = 4000;

// Image must ship Node + npm so the bridge bootstrap recipe installs and runs.
export const DAYTONA_DEFAULT_IMAGE = "node:24";

// Idle auto-stop window (minutes). The tail past a turn is the warm window for
// follow-ups; the harness reattaches before it elapses.
export const DAYTONA_AUTO_STOP_MINUTES = 5;

// Create can pull/build the image on a cold runner, which exceeds the SDK's 60s
// default. Forks-from-snapshot are fast, but the first build needs headroom.
export const DAYTONA_CREATE_TIMEOUT_SECONDS = 300;

// The bridge install (pnpm + claude-code postinstall) OOM-kills (exit 137) on the
// default ~1GiB sandbox; bump memory. Disk stays modest to respect the org's
// total-disk quota across concurrent sandboxes (default 3GiB sufficed for install).
export const DAYTONA_RESOURCES = { cpu: 2, memory: 4, disk: 5 } as const;

// Name scheme so resumeSession can re-fetch a session's sandbox deterministically.
const SESSION_NAME_PREFIX = "ai-sdk-harness-session";
export const sessionSandboxName = (sessionId: string) =>
	`${SESSION_NAME_PREFIX}-${sessionId}`;

// Template snapshot name scheme, keyed by the adapter's bootstrap-recipe identity
// so a recipe change forks a fresh template.
const TEMPLATE_SNAPSHOT_PREFIX = "ai-sdk-harness";
export const templateSnapshotName = (identity: string) =>
	`${TEMPLATE_SNAPSHOT_PREFIX}-${identity}`;
