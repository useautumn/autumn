import { prewarmHarness } from "@ai-sdk/harness/agent";
import { env as chatEnv } from "../../../lib/env.js";
import { buildAdapter } from "./adapter.js";
import { buildPrewarmSandboxProvider } from "./sandbox.js";

let prewarmed: Promise<void> | undefined;

/** Builds the adapter's recipe-keyed template snapshot once so sessions fork
 * from it instead of running the bridge install. Idempotent + cached.
 *
 * Skipped for Daytona/E2B: prewarm spins a second sandbox concurrent with the
 * live turn (blows small-tier memory quotas), and their templates are built and
 * cached lazily on the first createSession instead. */
export const prewarmAiSdkHarness = (): Promise<void> => {
	if (chatEnv.SANDBOX_PROVIDER !== "vercel") return Promise.resolve();
	prewarmed ??= buildPrewarmSandboxProvider().then((sandboxProvider) =>
		prewarmHarness({ harness: buildAdapter(), sandboxProvider }),
	);
	return prewarmed;
};
