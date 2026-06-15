import type { HarnessV1SandboxProvider } from "@ai-sdk/harness";
import { createVercelSandbox } from "@ai-sdk/sandbox-vercel";
import type { AppEnv } from "@autumn/shared";
import { type NetworkPolicy, Sandbox } from "@vercel/sandbox";
import { vercelCredentials } from "./credentials.js";
import { buildLeafNetworkPolicy } from "./networkPolicy.js";

// Sandbox runtime + lifetime. The bridge binds the first declared port, so we
// just expose one. Timeout is the VM's TOTAL per-session lifetime (not a
// post-turn idle), so it must exceed the 120s message budget or the VM gets
// reaped mid-turn — which drops the bridge WebSocket and crashes the process.
// The tail past a turn is the warm window for follow-ups.
const SANDBOX_RUNTIME = "node24";
const SANDBOX_PORTS = [4000];
const SANDBOX_TIMEOUT_MS = 3 * 60 * 1000;

// Mirrors @ai-sdk/sandbox-vercel's internal per-session sandbox name. Its
// resumeSession calls Sandbox.get WITHOUT credentials (canary.9 bug → OIDC
// fallback crashes authed follow-ups), so we reconnect by this name ourselves.
const SESSION_NAME_PREFIX = "ai-sdk-harness-session";

// Provider-created mode: the adapter's bootstrap recipe is installed once into a
// recipe-keyed template snapshot, and every session forks from it (no reinstall).
const provider = async (
	networkPolicy: NetworkPolicy,
): Promise<HarnessV1SandboxProvider> => {
	const credentials = await vercelCredentials();
	const base = createVercelSandbox({
		networkPolicy,
		ports: SANDBOX_PORTS,
		runtime: SANDBOX_RUNTIME,
		timeout: SANDBOX_TIMEOUT_MS,
		...credentials,
	});
	return {
		...base,
		// Reconnect the per-session sandbox WITH credentials, then reuse the SDK's
		// caller-provided wrapping to hand back a network session. Works around the
		// canary resumeSession dropping creds.
		resumeSession: ({
			abortSignal,
			sessionId,
		}: {
			abortSignal?: AbortSignal;
			sessionId: string;
		}) =>
			Sandbox.get({
				name: `${SESSION_NAME_PREFIX}-${sessionId}`,
				...credentials,
				...(abortSignal ? { signal: abortSignal } : {}),
			}).then((sandbox) =>
				// bridgePorts is required in caller-provided mode so the harness can
				// locate the in-sandbox bridge; omitting it crashes the bridge WS.
				createVercelSandbox({
					bridgePorts: SANDBOX_PORTS,
					sandbox,
				}).createSession({ abortSignal, sessionId }),
			),
	};
};

export const buildVercelSandboxProvider = ({
	anthropicApiKey,
	env,
	token,
}: {
	anthropicApiKey?: string;
	env: AppEnv;
	token: string;
}): Promise<HarnessV1SandboxProvider> =>
	provider(buildLeafNetworkPolicy({ anthropicApiKey, env, token }));

// No org token — used only to build/warm the recipe-keyed template snapshot.
export const buildVercelPrewarmProvider =
	(): Promise<HarnessV1SandboxProvider> => provider(buildLeafNetworkPolicy());
