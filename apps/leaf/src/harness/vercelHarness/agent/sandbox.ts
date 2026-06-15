import type { HarnessV1SandboxProvider } from "@ai-sdk/harness";
import type { AppEnv } from "@autumn/shared";
import { env as chatEnv } from "../../../lib/env.js";
import {
	buildDaytonaPrewarmProvider,
	buildDaytonaSandboxProvider,
} from "../../../providers/daytona/sandboxProvider.js";
import {
	buildE2bPrewarmProvider,
	buildE2bSandboxProvider,
} from "../../../providers/e2b/sandboxProvider.js";
import {
	buildVercelPrewarmProvider,
	buildVercelSandboxProvider,
} from "../../../providers/vercel/sandboxProvider.js";

// The harness is sandbox-agnostic; SANDBOX_PROVIDER swaps the underlying compute.
const builders = {
	vercel: {
		session: buildVercelSandboxProvider,
		prewarm: buildVercelPrewarmProvider,
	},
	daytona: {
		session: buildDaytonaSandboxProvider,
		prewarm: buildDaytonaPrewarmProvider,
	},
	e2b: {
		session: buildE2bSandboxProvider,
		prewarm: buildE2bPrewarmProvider,
	},
} as const;

export const buildSandboxProvider = (input: {
	env: AppEnv;
	token: string;
}): Promise<HarnessV1SandboxProvider> =>
	builders[chatEnv.SANDBOX_PROVIDER].session(input);

export const buildPrewarmSandboxProvider =
	(): Promise<HarnessV1SandboxProvider> =>
		builders[chatEnv.SANDBOX_PROVIDER].prewarm();
