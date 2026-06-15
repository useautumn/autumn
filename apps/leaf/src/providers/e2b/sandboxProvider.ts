import type {
	HarnessV1NetworkSandboxSession,
	HarnessV1SandboxProvider,
} from "@ai-sdk/harness";
import type { AppEnv } from "@autumn/shared";
import { Sandbox, Template } from "e2b";
import { env as chatEnv } from "../../lib/env.js";
import {
	E2B_RESOURCES,
	E2B_SANDBOX_TIMEOUT_MS,
	E2B_SESSION_METADATA_KEY,
} from "./config.js";
import { installBridgeWsErrorGuard } from "./bridgeWsGuard.js";
import {
	buildE2bNetworkSession,
	type RestrictedSandboxSession,
} from "./session.js";
import {
	BAKED_BRIDGE_DIR,
	BRIDGE_BOOTSTRAP_DIR,
	buildBakedTemplate,
} from "./template.js";

const E2B_PROVIDER_ID = "e2b-sandbox";

type FirstCreate = (
	session: RestrictedSandboxSession,
	opts: { abortSignal?: AbortSignal },
) => Promise<void>;

// E2B sandbox resources are fixed by the template (Sandbox.create can't override
// them) and the default base is too small for the bridge install. We always run
// from a custom template carrying node + pnpm + memory headroom; by default it
// also bakes the bridge install so cold starts skip the ~30s reinstall. Templates
// are durable org-wide, so this builds once (cached in-process within a run).
let templateBuild: Promise<{ name: string; baked: boolean }> | undefined;

const ensureTemplate = (): Promise<{ name: string; baked: boolean }> => {
	templateBuild ??= chatEnv.E2B_BAKE_BRIDGE
		? buildBakedTemplate().then((name) => ({ name, baked: true }))
		: (async () => {
				// Global pnpm install needs root at build time (exit 243 = npm EACCES as
				// the non-root build user); the bridge's runtime install is local.
				const template = Template()
					.fromNodeImage("24")
					.runCmd("npm install -g pnpm@9", { user: "root" });
				const name = "leaf-claude-node-pnpm-v1";
				await Template.build(template, name, {
					cpuCount: E2B_RESOURCES.cpuCount,
					memoryMB: E2B_RESOURCES.memoryMB,
				});
				return { name, baked: false };
			})();
	return templateBuild;
};

const apiKeyOpts = () =>
	chatEnv.E2B_API_KEY ? { apiKey: chatEnv.E2B_API_KEY } : {};

class E2bSandboxProvider implements HarnessV1SandboxProvider {
	readonly specificationVersion = "harness-sandbox-v1" as const;
	readonly providerId = E2B_PROVIDER_ID;

	createSession = async (options?: {
		sessionId?: string;
		abortSignal?: AbortSignal;
		identity?: string;
		onFirstCreate?: FirstCreate;
	}): Promise<HarnessV1NetworkSandboxSession> => {
		options?.abortSignal?.throwIfAborted();
		const template = await ensureTemplate();
		const sandbox = await Sandbox.create(template.name, {
			...apiKeyOpts(),
			timeoutMs: E2B_SANDBOX_TIMEOUT_MS,
			// IS_SANDBOX lets claude-code's allow-all (bypassPermissions) run even if
			// the box is root; harmless on E2B's non-root user. Defensive parity.
			envs: { IS_SANDBOX: "1" },
			...(options?.sessionId
				? { metadata: { [E2B_SESSION_METADATA_KEY]: options.sessionId } }
				: {}),
		});
		const session = await buildE2bNetworkSession({
			sandbox,
			ownsLifecycle: true,
		});
		// Seed the adapter's hardcoded bootstrap dir with the baked node_modules
		// (copied, not symlinked, so it's owned by the runtime user — the adapter
		// re-runs install.cjs which must unlink/chmod the binary). Its subsequent
		// `pnpm install --frozen-lockfile` is then a no-op (deps already present).
		if (template.baked) {
			await session.run({
				command: `mkdir -p ${BRIDGE_BOOTSTRAP_DIR} && cp -r ${BAKED_BRIDGE_DIR}/node_modules ${BRIDGE_BOOTSTRAP_DIR}/node_modules`,
			});
		}
		if (options?.onFirstCreate) {
			await options.onFirstCreate(session.restricted(), {
				abortSignal: options.abortSignal,
			});
		}
		return session;
	};

	resumeSession = async (options: {
		sessionId: string;
		abortSignal?: AbortSignal;
	}): Promise<HarnessV1NetworkSandboxSession> => {
		options.abortSignal?.throwIfAborted();
		// E2B has no name lookup; find the session's sandbox by metadata, then
		// connect (auto-resumes if paused).
		const page = await Sandbox.list({
			...apiKeyOpts(),
			query: { metadata: { [E2B_SESSION_METADATA_KEY]: options.sessionId } },
			limit: 1,
		}).nextItems();
		const found = page[0];
		if (!found) {
			throw new Error(
				`No E2B sandbox found for session ${options.sessionId} to resume.`,
			);
		}
		const sandbox = await Sandbox.connect(found.sandboxId, apiKeyOpts());
		return buildE2bNetworkSession({ sandbox, ownsLifecycle: true });
	};
}

// The Autumn secret never enters the sandbox (Autumn tools run host-side), so no
// credential brokering is needed; the model key reaches the adapter via its auth
// env, matching Vercel/Daytona.
export const buildE2bSandboxProvider = (_input: {
	anthropicApiKey?: string;
	env: AppEnv;
	token: string;
}): Promise<HarnessV1SandboxProvider> => {
	installBridgeWsErrorGuard();
	return Promise.resolve(new E2bSandboxProvider());
};

export const buildE2bPrewarmProvider = (): Promise<HarnessV1SandboxProvider> => {
	installBridgeWsErrorGuard();
	return Promise.resolve(new E2bSandboxProvider());
};
