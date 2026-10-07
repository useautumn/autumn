import { resolve } from "node:path";
import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import { REPO_ROOT } from "../../../catalog/repoPaths.ts";

/**
 * Runtime-loaded scripts/tw modules. Static imports would drag the server + shared
 * graphs into twd's typecheck, so these are the structural types we rely on.
 */
export type ProviderSandbox = { name: string; handle: unknown; id?: string };

export type WorkerHandle = {
	name: string;
	sandboxId?: string;
	publicUrl: string;
	accountId?: string;
	capabilities: string[];
	lastFile?: string;
	inFlight: number;
};

export type TestExecutor = {
	run(args: {
		file: string;
		failedTestNames?: string[];
		onChunk: (text: string) => void;
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }>;
};

export type WorkerPool = {
	readonly idleCount: number;
	readonly size: number;
	close(): void;
	add(worker: WorkerHandle): void;
	cullIdle(count: number, keepMin: number): WorkerHandle[];
	markDead(worker: WorkerHandle): void;
};

export type TwModules = {
	provider: {
		setProvider(name: "modalv2"): Promise<void>;
		forkWorker(opts: {
			sourceSandbox: string;
			name: string;
			env: Record<string, string>;
			tags: Record<string, string>;
			signal?: AbortSignal;
		}): Promise<ProviderSandbox>;
		getPublicUrl(sandbox: ProviderSandbox, port: number): Promise<string>;
		getSandboxByName(name: string): Promise<ProviderSandbox | undefined>;
		deleteSandbox(sandbox: ProviderSandbox | string): Promise<void>;
		isSandboxStreamClosed(error: unknown): boolean;
	};
	run: {
		buildWorkerEnv(args: {
			stripeAccountId: string;
			stripeSecretKey: string;
			capabilities: string[];
			svixAppId?: string;
			stripeClientId?: string;
			ingressUrl: string;
			ingressToken: string;
		}): Record<string, string>;
		getOrBuildWarmParent(args: {
			ref: string;
			sha: string;
			signal: AbortSignal;
		}): Promise<string>;
		waitForReady(args: {
			sandbox: ProviderSandbox;
			name: string;
			signal: AbortSignal;
		}): Promise<void>;
		startCulling(
			pool: WorkerPool,
			resolveSandbox: (worker: WorkerHandle) => ProviderSandbox | undefined,
		): () => void;
		toSandboxPath(localFile: string): string;
		deleteSvixApp(appId: string): Promise<void>;
	};
	pool: {
		WorkerPool: new (
			workers: WorkerHandle[],
			slotsPerWorker?: number,
		) => WorkerPool;
	};
	remoteExecutor: {
		RemoteExecutor: new (opts: {
			pool: WorkerPool;
			resolveSandbox: (worker: WorkerHandle) => ProviderSandbox | undefined;
			toWorkerPath?: (localFile: string) => string;
			onFileStats?: (event: {
				file: string;
				worker: string;
				stats: FileStats;
			}) => void;
		}) => TestExecutor;
	};
	ingress: {
		pushWorkerMapping(args: {
			ingressUrl: string;
			token: string;
			accountId: string;
			workerUrl: string;
		}): Promise<void>;
	};
	svix: {
		createSvixApp(orgId: string): Promise<string>;
	};
	stripe: {
		createSandboxSubAccount(args: {
			orgName: string;
			ownerEmail: string;
			owner: string;
			runId: string;
			orgId: string;
			secretKey: string;
			extraMetadata?: Record<string, string>;
		}): Promise<string>;
	};
	capabilities: {
		partitionByCapability(files: string[]): Promise<{
			normalFiles: string[];
			capabilityShards: { capabilities: string[]; files: string[] }[];
		}>;
	};
	constants: { SERVER_PORT: number; WARM_SANDBOX_PREFIX: string };
	testOrg: { TEST_ORG_CONFIG: { id: string } };
};

const TW_ROOT = resolve(REPO_ROOT, "scripts/tw");
const load = <T>(path: string): Promise<T> => import(resolve(TW_ROOT, path));

/** Must run after STRIPE_TEST_KEY_POOL is set: run.ts sizes a budget at import. */
export const loadTwModules = async (): Promise<TwModules> => ({
	provider: await load("helpers/provider.ts"),
	run: await load("commands/run.ts"),
	pool: await load("helpers/pool.ts"),
	remoteExecutor: await load("helpers/remoteExecutor.ts"),
	ingress: await load("helpers/ingress.ts"),
	svix: await load("helpers/svix.ts"),
	stripe: await load("helpers/stripe.ts"),
	capabilities: await load("helpers/testCapabilities.ts"),
	constants: await load("constants.ts"),
	testOrg: await load("../setupTestUtils/createTestOrg.ts"),
});
