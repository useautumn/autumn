import type {
	HarnessV1NetworkSandboxSession,
	HarnessV1SandboxProvider,
} from "@ai-sdk/harness";
import type { AppEnv } from "@autumn/shared";
import type {
	CreateSandboxFromSnapshotParams,
	Sandbox,
} from "@daytonaio/sdk";
import { env as chatEnv } from "../../lib/env.js";
import { daytonaClient } from "./client.js";
import {
	DAYTONA_AUTO_STOP_MINUTES,
	DAYTONA_CREATE_TIMEOUT_SECONDS,
	DAYTONA_DEFAULT_IMAGE,
	DAYTONA_RESOURCES,
	sessionSandboxName,
	templateSnapshotName,
} from "./config.js";
import {
	buildDaytonaNetworkSession,
	type RestrictedSandboxSession,
} from "./session.js";

const DAYTONA_PROVIDER_ID = "daytona-sandbox";

type FirstCreate = (
	session: RestrictedSandboxSession,
	opts: { abortSignal?: AbortSignal },
) => Promise<void>;

// Process-wide cache of recipe-identity → published template snapshot name, plus
// an in-flight build lock so concurrent sessions don't rebuild the template.
const snapshotCache = new Map<string, string>();
const snapshotBuilds = new Map<string, Promise<string | undefined>>();

const commonParams = () => ({
	// Public preview so the harness can reach the bridge port; the bridge's own
	// channel token gates access (same posture as Vercel's routable domains).
	public: true,
	autoStopInterval: DAYTONA_AUTO_STOP_MINUTES,
	// Reclaim disk quota: delete a sandbox a while after it auto-stops.
	autoDeleteInterval: DAYTONA_AUTO_STOP_MINUTES * 3,
	resources: DAYTONA_RESOURCES,
	// Daytona runs as root; claude-code refuses --dangerously-skip-permissions
	// (the bridge's allow-all mode) as root unless IS_SANDBOX marks the box safe.
	envVars: { IS_SANDBOX: "1" },
});

const imageCreateParams = () => ({
	...commonParams(),
	image: chatEnv.DAYTONA_SANDBOX_IMAGE ?? DAYTONA_DEFAULT_IMAGE,
});

const createOptions = { timeout: DAYTONA_CREATE_TIMEOUT_SECONDS };

// The claude-code bootstrap installs the bridge with pnpm, which the node image
// doesn't ship (Vercel's node24 runtime does). Pin pnpm 9 (not corepack-latest):
// the bridge pins no packageManager, and pnpm 10+ hard-fails on the deliberately
// ignored @anthropic-ai/claude-code build script (the recipe runs its installer
// itself in a later step). pnpm 9 only warns, and reads the v9.0 lockfile. Baked
// into the snapshot so forks inherit it.
const ensurePnpm = async (session: {
	run: (opts: {
		command: string;
		env?: Record<string, string>;
	}) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}): Promise<void> => {
	const result = await session.run({
		command: "npm install -g pnpm@9 && pnpm --version",
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`Failed to install pnpm in Daytona sandbox (exit ${result.exitCode}): ${result.stdout}`,
		);
	}
};

// Build the recipe-keyed template snapshot once: create a base sandbox, apply the
// adapter bootstrap, snapshot it, discard the base. Returns the snapshot name, or
// undefined if snapshotting failed (caller falls back to a fresh install).
const ensureTemplateSnapshot = async ({
	identity,
	onFirstCreate,
	abortSignal,
}: {
	identity: string;
	onFirstCreate: FirstCreate;
	abortSignal?: AbortSignal;
}): Promise<string | undefined> => {
	const cached = snapshotCache.get(identity);
	if (cached) return cached;
	const inFlight = snapshotBuilds.get(identity);
	if (inFlight) return inFlight;

	const build = (async () => {
		const daytona = daytonaClient();
		const snapshotName = templateSnapshotName(identity);
		let base: Sandbox | undefined;
		try {
			base = await daytona.create(imageCreateParams(), createOptions);
			const session = await buildDaytonaNetworkSession({
				sandbox: base,
				ownsLifecycle: true,
			});
			await ensurePnpm(session);
			await onFirstCreate(session.restricted(), { abortSignal });
			await base._experimental_createSnapshot(snapshotName);
			snapshotCache.set(identity, snapshotName);
			return snapshotName;
		} catch {
			return undefined;
		} finally {
			await base?.delete().catch(() => undefined);
		}
	})();
	snapshotBuilds.set(identity, build);
	try {
		return await build;
	} finally {
		snapshotBuilds.delete(identity);
	}
};

class DaytonaSandboxProvider implements HarnessV1SandboxProvider {
	readonly specificationVersion = "harness-sandbox-v1" as const;
	readonly providerId = DAYTONA_PROVIDER_ID;

	createSession = async (options?: {
		sessionId?: string;
		abortSignal?: AbortSignal;
		identity?: string;
		onFirstCreate?: FirstCreate;
	}): Promise<HarnessV1NetworkSandboxSession> => {
		options?.abortSignal?.throwIfAborted();
		const daytona = daytonaClient();
		const nameOverride = options?.sessionId
			? { name: sessionSandboxName(options.sessionId) }
			: {};

		const snapshotName =
			chatEnv.DAYTONA_USE_SNAPSHOT_TEMPLATE &&
			options?.identity &&
			options.onFirstCreate
				? await ensureTemplateSnapshot({
						identity: options.identity,
						onFirstCreate: options.onFirstCreate,
						abortSignal: options.abortSignal,
					})
				: undefined;

		// Template path: fork from the published snapshot (no reinstall). The
		// snapshot already carries the image, so don't re-send `image`. `resources`
		// is forwarded at runtime for the snapshot source even though the SDK type
		// omits it from the snapshot variant.
		if (snapshotName) {
			const forkParams = {
				...commonParams(),
				snapshot: snapshotName,
				...nameOverride,
			} as unknown as CreateSandboxFromSnapshotParams;
			const sandbox = await daytona.create(forkParams, createOptions);
			const session = await buildDaytonaNetworkSession({
				sandbox,
				ownsLifecycle: true,
			});
			return session;
		}

		// Fresh path: create from image, then apply the bootstrap recipe inline.
		const sandbox = await daytona.create(
			{ ...imageCreateParams(), ...nameOverride },
			createOptions,
		);
		const session = await buildDaytonaNetworkSession({
			sandbox,
			ownsLifecycle: true,
		});
		if (options?.onFirstCreate) {
			await ensurePnpm(session);
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
		const daytona = daytonaClient();
		const sandbox = await daytona.get(sessionSandboxName(options.sessionId));
		return buildDaytonaNetworkSession({ sandbox, ownsLifecycle: true });
	};
}

// Egress is open by default; the Autumn secret never enters the sandbox (Autumn
// tools run host-side), so no credential brokering is needed here — unlike Vercel
// the model key reaches the adapter via its auth env, not an egress header.
export const buildDaytonaSandboxProvider = (_input: {
	anthropicApiKey?: string;
	env: AppEnv;
	token: string;
}): Promise<HarnessV1SandboxProvider> =>
	Promise.resolve(new DaytonaSandboxProvider());

export const buildDaytonaPrewarmProvider =
	(): Promise<HarnessV1SandboxProvider> =>
		Promise.resolve(new DaytonaSandboxProvider());
