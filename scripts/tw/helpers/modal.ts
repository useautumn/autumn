/**
 * Modal backend for the provider seam (helpers/provider.ts).
 *
 * Implements `ProviderImpl` over the `modal` SDK (v0.8.0). Exports TWO providers
 * from one factory (`makeModalProvider`):
 *   - `modalProvider` (`--provider=modal`): classic V1 backend — tags, list,
 *     fromName, but capped at 5 creates/s + 100 concurrent (so fan-out is paced).
 *   - `modalV2Provider` (`--provider=modalv2`): experimental V2 backend —
 *     `experimentalCreate`, 10k concurrent + 20+/s (NO pacing), region-pinned, but
 *     NO tags/list/fromName (teardown reattaches by sandboxId via `fromId`, tracked
 *     in the run registry; orphans rely on each sandbox's `timeoutMs` auto-expiry).
 *
 * ## Lifecycle mapping (vs Vercel)
 *   - **base image** — the published Debian services image (helpers/modalImage.ts),
 *     NOT build-base.sh (which is dnf/AL2023-only). run.ts skips build-base.sh
 *     when provider=modal; services are baked into this image.
 *   - **createWarmSandbox** — `sandboxes.create(app, baseImage, {command:["sleep",
 *     "infinity"]})` then `git clone @ ref` into /repo (Modal's create does NOT
 *     clone a git source the way Vercel's SDK does).
 *   - **snapshotAndStop** — `sb.snapshotFilesystem()` → an `Image`; stored by warm
 *     name. The warm parent is terminated (workers fork from the Image, not it).
 *   - **forkWorker** — create from the stored warm snapshot, `encryptedPorts:
 *     [SERVER_PORT]` for the tunnel. V1 paces creates (120 burst + ~4.5/s, ≤100
 *     concurrent cap); V2 has no pacing.
 *   - **boot** — run.ts execs `bun boot.ts` detached (same as Vercel); Modal exec
 *     returns a process handle immediately and does NOT block on long-lived procs.
 *   - **getPublicUrl** — `sb.tunnels()[port].url`. **deleteSandbox** — `sb.terminate()`.
 *
 * Validated end-to-end (1400+ tests passing; ~41s 100-wide fan-out on us-east-1).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import {
	type App,
	type Image,
	type Logger,
	ModalClient,
	type Sandbox,
} from "modal";
import {
	INGRESS_PORT,
	PROJECT_ROOT,
	SERVER_PORT,
	WORKER_TIMEOUT_MS,
} from "../constants.ts";
import { narrate, sink } from "./logSink.ts";
import { type BaseImageDeps, buildBaseImage } from "./modalImage.ts";
import type {
	CreateSandboxOptions,
	DetachedCommand,
	ForkWorkerOptions,
	GitSource,
	ListedSandbox,
	ProviderImpl,
	ProviderSandbox,
	RunDetachedOptions,
	RunStreamingOptions,
	RunStreamingResult,
} from "./provider.ts";

/** Where the repo is cloned inside every Modal sandbox (cf. /vercel/sandbox). */
const MODAL_REPO_ROOT = "/repo";
/**
 * node_modules is BAKED into the base image at /repo/node_modules (see
 * modalImage.ts) rather than snapshotted or mounted from a Volume: a base layer
 * is both local-fast to read (fast boot) AND excluded from the snapshot diff
 * (fast snapshot). The warm clone preserves it; warmup.sh reconciles the delta.
 */
/** The Modal App all swarm sandboxes live under (one per Modal workspace). */
const APP_NAME = "autumn-tw";
/**
 * Worker size. Each worker runs the server + PG + Dragonfly + goaws AND up to
 * `--per-worker` (default 4) concurrent test files. 2 vCPU + 4 GiB is validated
 * at scale (full suite, 1422 passing) and ~halves the per-worker cost vs the
 * earlier 4/8 default. Env-overridable (`TW_MODAL_WORKER_CPU` / `_MEM_MIB`) so a
 * heavier shard can be dialed up — or a resource-quota kill ruled out — without
 * a rebuild.
 */
const WORKER_CPU = Number(process.env.TW_MODAL_WORKER_CPU ?? 2);
const WORKER_MEMORY_MIB = Number(process.env.TW_MODAL_WORKER_MEM_MIB ?? 4096);
const INGRESS_MEMORY_MIB = 1024;
/**
 * Snapshot budget — the warm filesystem (node_modules + migrated PGDATA, tens of
 * thousands of files) far exceeds Modal's 55s default, so give it 10 min.
 */
const SNAPSHOT_TIMEOUT_MS = 10 * 60 * 1000;

const secs = (ms: number): string => (ms / 1000).toFixed(1);

/**
 * Timed stage breadcrumb, ALWAYS visible on the terminal (via `narrate`, which
 * ignores quiet mode). Logs `▸ label` immediately, an optional heartbeat every
 * `heartbeatMs` for long opaque ops (image build, snapshot — so the terminal is
 * never silent for minutes), and `✓ label (+Xs)` on completion. Returns the
 * done-callback.
 */
const stage = (label: string, heartbeatMs?: number): (() => void) => {
	const startedAt = Date.now();
	narrate(chalk.magenta(`[modal] ▸ ${label}`));
	const ticker =
		heartbeatMs === undefined
			? undefined
			: setInterval(() => {
					narrate(
						chalk.magenta.dim(
							`[modal]   … ${label} — still running (+${secs(Date.now() - startedAt)}s)`,
						),
					);
				}, heartbeatMs);
	return () => {
		if (ticker) {
			clearInterval(ticker);
		}
		narrate(
			chalk.magenta(`[modal] ✓ ${label} (+${secs(Date.now() - startedAt)}s)`),
		);
	};
};

/** Forward the Modal SDK's own logs (notably image-build progress) to the sink. */
const sdkLogger: Logger = {
	// debug is gRPC-level chatter → file only (sink respects quiet mode).
	debug: (message: string) => sink(chalk.dim(`[modal-sdk] ${message}\n`)),
	info: (message: string) => narrate(chalk.dim(`[modal-sdk] ${message}`)),
	warn: (message: string) => narrate(chalk.yellow(`[modal-sdk] ${message}`)),
	error: (message: string) => narrate(chalk.red(`[modal-sdk] ${message}`)),
};

const modal = new ModalClient({ logger: sdkLogger, logLevel: "info" });

let appPromise: Promise<App> | undefined;
const getApp = (): Promise<App> => {
	appPromise ??= modal.apps.fromName(APP_NAME, { createIfMissing: true });
	return appPromise;
};

/** Clone URL. The repo is public → anonymous (no token); a token is embedded only
 * if `TW_GIT_TOKEN` is explicitly set (private fork). */
const cloneUrl = (source: GitSource): string =>
	source.username && source.password
		? source.url.replace(
				/^https:\/\//,
				`https://${encodeURIComponent(source.username)}:${encodeURIComponent(source.password)}@`,
			)
		: source.url;

/** Hash of the local lockfile — cache-busts the image's node_modules bake. */
const lockHash = (): string => {
	for (const name of ["bun.lock", "bun.lockb", "package-lock.json"]) {
		try {
			const buf = readFileSync(join(PROJECT_ROOT, name));
			return createHash("sha256").update(buf).digest("hex").slice(0, 16);
		} catch {
			// try the next candidate
		}
	}
	return "nolock";
};

let baseImagePromise: Promise<Image> | undefined;
const getBaseImage = (deps: BaseImageDeps): Promise<Image> => {
	baseImagePromise ??= (async () => {
		const app = await getApp();
		const done = stage(
			"building base services image + node_modules (first run ~2-3m; cached after)",
			15_000,
		);
		try {
			return await buildBaseImage(modal, app, deps);
		} finally {
			done();
		}
	})();
	return baseImagePromise;
};

/** Warm snapshot images keyed by warm sandbox name (forkWorker restores these). */
const warmImageByName = new Map<string, Image>();
/**
 * Live sandboxes created this process, keyed by BOTH our name AND the Modal
 * sandboxId, so teardown resolves an in-run name (fast path) or a cross-process
 * id (V2 has no `fromName` — only `fromId`).
 */
const liveSandboxes = new Map<string, Sandbox>();

const wrap = (name: string, handle: Sandbox): ProviderSandbox => ({
	name,
	handle,
	id: handle.sandboxId,
});
const unwrap = (sandbox: ProviderSandbox): Sandbox => sandbox.handle as Sandbox;

/**
 * Modal region for V2 placement. Defaults to us-east-1: benchmarks showed
 * eu-west-2 (London) cliffs at N=100 — `experimentalCreate` (which blocks until
 * the VM is live) jumps from ~8s @ N=50 to ~2m33s @ N=100 — while us-east-1 holds
 * at ~1s/create, turning a 100-wide fan-out from 3m45s into ~41s. Override with
 * `TW_MODAL_REGION` (e.g. eu-west-2 for small London-local runs).
 */
const MODAL_REGION = process.env.TW_MODAL_REGION ?? "us-east-1";

/** Stamp the name into tags so `list({tags})` can recover it (Sandbox has no name). */
const tagsWithName = (
	name: string,
	tags: Record<string, string>,
): Record<string, string> => ({ ...tags, name });

// ---- create pacing (stay under the 5/s create limit, 150 burst allowance) ----
const CREATE_BURST = 120;
const CREATE_MIN_INTERVAL_MS = 220;
let createCount = 0;
let paceChain: Promise<void> = Promise.resolve();
const sleep = (msDelay: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, msDelay));

/** Resolve when it's safe to issue the next `create` (no-op within the burst). */
const pace = (): Promise<void> => {
	if (createCount++ < CREATE_BURST) {
		return Promise.resolve();
	}
	paceChain = paceChain.then(() => sleep(CREATE_MIN_INTERVAL_MS));
	return paceChain;
};

/** Drain a Modal stdout/stderr stream chunk-by-chunk into a text callback. */
const pumpStream = async <T extends string | Uint8Array>(
	stream: ReadableStream<T>,
	onText: (text: string) => void,
): Promise<void> => {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value !== undefined && value !== null) {
				onText(typeof value === "string" ? value : decoder.decode(value));
			}
		}
	} finally {
		reader.releaseLock();
	}
};

/** Transient gRPC/transport faults reaching a sandbox's exec endpoint — retryable
 * (DNS not yet propagated, momentary UNAVAILABLE), vs a real command error. */
const isTransientExecError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	const code = (error as { code?: number })?.code;
	return (
		code === 14 /* gRPC UNAVAILABLE */ ||
		/UNAVAILABLE|Name resolution failed|ECONNREFUSED|ECONNRESET|connection (closed|reset|refused)|deadline exceeded|temporarily unavailable|no healthy upstream/i.test(
			message,
		)
	);
};

const EXEC_RETRIES = 5;

/**
 * Wrap a `sb.exec(...)` START in retry-with-backoff for transient transport
 * faults. One flaky `TaskExecStart` (e.g. "Name resolution failed for target
 * …w.modal.host") shouldn't kill the warm-up or a worker boot — at N=200 a few
 * are expected. Only the START is retried; once a process is returned, streaming
 * faults are handled by swallowStreamClose / WorkerDeathError.
 */
const withExecRetry = async <T>(
	label: string,
	start: () => Promise<T>,
): Promise<T> => {
	for (let attempt = 0; ; attempt++) {
		try {
			return await start();
		} catch (error) {
			if (attempt >= EXEC_RETRIES || !isTransientExecError(error)) {
				throw error;
			}
			const delayMs =
				Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);
			narrate(
				chalk.yellow(
					`[modal] ${label}: exec start failed transiently (${(error as Error).message?.slice(0, 70)}…) — retry ${attempt + 1}/${EXEC_RETRIES} in ${delayMs}ms`,
				),
			);
			await sleep(delayMs);
		}
	}
};

/** Clone the repo into /repo at the ref (Modal create doesn't clone git). */
const cloneRepo = async (
	sandbox: Sandbox,
	source: GitSource,
): Promise<void> => {
	const url = cloneUrl(source);
	// /repo already exists and is non-empty (node_modules is baked into the base
	// image there) → `git clone /repo` would fail. Clone to a temp dir and move
	// the source into /repo, PRESERVING the baked node_modules. Full clone (not
	// shallow) so a non-default revision (e.g. feat/*) resolves + warmup.sh's own
	// `git checkout <ref>` is a no-op.
	const script = [
		"set -e",
		"shopt -s dotglob nullglob",
		"rm -rf /tmp/twclone",
		`git clone ${url} /tmp/twclone`,
		`git -C /tmp/twclone checkout ${source.revision}`,
		`mkdir -p ${MODAL_REPO_ROOT}`,
		"for entry in /tmp/twclone/*; do",
		'  base=$(basename "$entry")',
		'  [ "$base" = "node_modules" ] && continue',
		`  rm -rf "${MODAL_REPO_ROOT}/$base"`,
		`  mv "$entry" "${MODAL_REPO_ROOT}/$base"`,
		"done",
		"rm -rf /tmp/twclone",
	].join("\n");
	// Run from `/` (always exists): the sandbox's default workdir is /repo, which
	// doesn't exist until THIS clone creates it — execing there fails with
	// "Unable to read current working directory".
	const done = stage(`clone repo @ ${source.revision}`);
	const proc = await withExecRetry("clone", () =>
		sandbox.exec(["bash", "-lc", script], {
			stdout: "pipe",
			stderr: "pipe",
			workdir: "/",
		}),
	);
	let stderrText = "";
	await Promise.all([
		pumpStream(proc.stdout, (text) => sink(text)),
		pumpStream(proc.stderr, (text) => {
			stderrText += text;
			sink(text);
		}),
	]);
	const exitCode = await proc.wait();
	done();
	if (exitCode !== 0) {
		throw new Error(
			`modal: git clone failed (exit ${exitCode}): ${stderrText}`,
		);
	}
};

/** Shared stream-closed classifier (used by runStreaming + the provider method). */
const isSandboxStreamClosed = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return /terminated|already (completed|finished)|stream (closed|error)|connection (closed|reset)|ECONNRESET|UNAVAILABLE|task .* (exited|gone)/i.test(
		message,
	);
};

/**
 * Create a sandbox. `v2=true` uses Modal's experimental V2 backend (10k
 * concurrent, 20+/s) — NO pacing, NO tags/name (unsupported), region-pinned. V1
 * uses the classic `create` (tags + name + 5/s pacing). Both tracked in
 * {@link liveSandboxes} by name AND sandboxId for teardown.
 */
const createFromImage = async (
	image: Image,
	opts: {
		name: string;
		env: Record<string, string>;
		tags: Record<string, string>;
		cpu: number;
		memoryMiB: number;
		timeout?: number;
		encryptedPorts?: number[];
	},
	v2: boolean,
): Promise<Sandbox> => {
	const app = await getApp();
	if (!v2) {
		// V1 only: stay under the 5/s create + 100-concurrent caps. V2 doesn't need it.
		await pace();
	}
	const done = stage(`create sandbox ${opts.name}`);
	const base = {
		cpu: opts.cpu,
		memoryMiB: opts.memoryMiB,
		timeoutMs: opts.timeout ?? WORKER_TIMEOUT_MS,
		command: ["sleep", "infinity"],
		env: opts.env,
		workdir: MODAL_REPO_ROOT,
		encryptedPorts: opts.encryptedPorts,
	};
	const sandbox = v2
		? await modal.sandboxes.experimentalCreate(app, image, {
				...base,
				// V2 supports neither tags nor name lookups; pin the region instead.
				regions: [MODAL_REGION],
			})
		: await modal.sandboxes.create(app, image, {
				...base,
				tags: tagsWithName(opts.name, opts.tags),
				name: opts.name,
			});
	liveSandboxes.set(opts.name, sandbox);
	liveSandboxes.set(sandbox.sandboxId, sandbox);
	done();
	return sandbox;
};

const makeModalProvider = (v2: boolean): ProviderImpl => ({
	async createWarmSandbox(
		opts: CreateSandboxOptions,
	): Promise<ProviderSandbox> {
		if (!opts.source) {
			throw new Error("modal: createWarmSandbox requires a git source");
		}
		// The base image bakes node_modules for THIS ref (cache-keyed on the
		// lockfile), so the warm clone + workers read deps from a fast local layer.
		const image = await getBaseImage({
			gitUrl: cloneUrl(opts.source),
			gitRef: opts.source.revision,
			lockHash: lockHash(),
		});
		const sandbox = await createFromImage(
			image,
			{
				name: opts.name,
				env: opts.env,
				tags: opts.tags,
				cpu: opts.vcpus ?? WORKER_CPU,
				memoryMiB: WORKER_MEMORY_MIB,
				timeout: opts.timeout,
				encryptedPorts: opts.ports ?? [SERVER_PORT],
			},
			v2,
		);
		await cloneRepo(sandbox, opts.source);
		return wrap(opts.name, sandbox);
	},

	async createIngressSandbox(
		opts: CreateSandboxOptions,
	): Promise<ProviderSandbox> {
		if (!opts.source) {
			throw new Error("modal: createIngressSandbox requires a git source");
		}
		const image = await getBaseImage({
			gitUrl: cloneUrl(opts.source),
			gitRef: opts.source.revision,
			lockHash: lockHash(),
		});
		const sandbox = await createFromImage(
			image,
			{
				name: opts.name,
				env: opts.env,
				tags: opts.tags,
				cpu: opts.vcpus ?? 1,
				memoryMiB: INGRESS_MEMORY_MIB,
				timeout: opts.timeout,
				encryptedPorts: opts.ports ?? [INGRESS_PORT],
			},
			v2,
		);
		await cloneRepo(sandbox, opts.source);
		return wrap(opts.name, sandbox);
	},

	async forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox> {
		const image = warmImageByName.get(opts.sourceSandbox);
		if (!image) {
			throw new Error(
				`modal: no warm snapshot for "${opts.sourceSandbox}" — snapshotAndStop must run first`,
			);
		}
		// node_modules is in the base image layer (fast local reads); the worker
		// forks from the warm snapshot for the source + migrated PGDATA.
		const sandbox = await createFromImage(
			image,
			{
				name: opts.name,
				env: opts.env,
				tags: opts.tags,
				cpu: opts.vcpus ?? WORKER_CPU,
				memoryMiB: WORKER_MEMORY_MIB,
				timeout: opts.timeout,
				encryptedPorts: opts.ports ?? [SERVER_PORT],
			},
			v2,
		);
		return wrap(opts.name, sandbox);
	},

	async snapshotAndStop(sandbox: ProviderSandbox): Promise<string> {
		const sb = unwrap(sandbox);
		// Services were clean-stopped by warmup.sh; capture the filesystem (/repo
		// source + migrated PGDATA + any node_modules delta — the bulk of
		// node_modules is in the base image layer, NOT this diff). Workers fork from
		// this Image. Generous budget + heartbeat so the terminal isn't silent.
		const done = stage("snapshot warm filesystem (source + pgdata)", 15_000);
		try {
			const image = await sb.snapshotFilesystem({
				timeoutMs: SNAPSHOT_TIMEOUT_MS,
			});
			warmImageByName.set(sandbox.name, image);
			// The warm parent is no longer needed (forks use the Image) — free it.
			await sb.terminate().catch(() => {
				/* best-effort */
			});
			liveSandboxes.delete(sandbox.name);
			liveSandboxes.delete(sb.sandboxId);
			return image.imageId;
		} finally {
			done();
		}
	},

	async getPublicUrl(sandbox: ProviderSandbox, port: number): Promise<string> {
		const tunnels = await unwrap(sandbox).tunnels();
		const tunnel = tunnels[port];
		if (!tunnel) {
			throw new Error(
				`modal: no tunnel for port ${port} (encryptedPorts must include it at create)`,
			);
		}
		return tunnel.url;
	},

	async getSandboxByName(name: string): Promise<ProviderSandbox | undefined> {
		const local = liveSandboxes.get(name);
		if (local) {
			return wrap(name, local);
		}
		// No cross-run warm cache (warm parent terminated after snapshot). V2 has no
		// fromName at all → undefined makes run.ts build fresh.
		if (v2) {
			return undefined;
		}
		try {
			const sb = await modal.sandboxes.fromName(APP_NAME, name);
			return wrap(name, sb);
		} catch {
			return undefined;
		}
	},

	async deleteSandbox(sandboxOrName: ProviderSandbox | string): Promise<void> {
		// Callers pass the sandboxId (preferred) or our name. In-run: hit the live
		// map (keyed by both). Cross-process (`bun tw kill`): reattach via fromId
		// (V2 has no fromName; V1 falls back to it).
		const key =
			typeof sandboxOrName === "string"
				? sandboxOrName
				: (sandboxOrName.id ?? sandboxOrName.name);
		let target: Sandbox | undefined =
			typeof sandboxOrName === "string"
				? liveSandboxes.get(key)
				: unwrap(sandboxOrName);
		if (!target) {
			target = await modal.sandboxes.fromId(key).catch(() => undefined);
			if (!target && !v2) {
				target = await modal.sandboxes
					.fromName(APP_NAME, key)
					.catch(() => undefined);
			}
		}
		if (target) {
			await target.terminate().catch(() => {
				/* already gone */
			});
		}
		liveSandboxes.delete(key);
		warmImageByName.delete(key);
		if (typeof sandboxOrName !== "string") {
			liveSandboxes.delete(sandboxOrName.name);
		}
	},

	async runStreaming(
		sandbox: ProviderSandbox,
		argv: string[],
		onChunk: (text: string) => void,
		opts?: RunStreamingOptions,
	): Promise<RunStreamingResult> {
		const proc = await withExecRetry("exec", () =>
			unwrap(sandbox).exec(argv, {
				stdout: "pipe",
				stderr: "pipe",
				workdir: MODAL_REPO_ROOT,
				env: opts?.env,
			}),
		);
		let stderrText = "";
		const pumps = Promise.all([
			pumpStream(proc.stdout, onChunk),
			pumpStream(proc.stderr, (text) => {
				stderrText += text;
				onChunk(text);
			}),
		]);
		try {
			await pumps;
		} catch (error) {
			if (!(opts?.swallowStreamClose && isSandboxStreamClosed(error))) {
				throw error;
			}
		}
		const exitCode = await proc.wait();
		return { exitCode, stderr: stderrText };
	},

	async runDetached(
		sandbox: ProviderSandbox,
		argv: string[],
		opts: RunDetachedOptions,
	): Promise<DetachedCommand> {
		const proc = await withExecRetry("boot", () =>
			unwrap(sandbox).exec(argv, {
				stdout: "pipe",
				stderr: "pipe",
				workdir: opts.cwd ?? MODAL_REPO_ROOT,
				env: opts.env,
			}),
		);
		// Long-lived (boot/server): drain output in the background; resolve `wait`
		// only if/when the process exits. Modal exec returns immediately.
		void pumpStream(proc.stdout, opts.onChunk).catch(() => {
			/* stream closed on teardown */
		});
		void pumpStream(proc.stderr, opts.onChunk).catch(() => {
			/* stream closed on teardown */
		});
		return {
			wait: async () => ({ exitCode: await proc.wait() }),
		};
	},

	async listSandboxesByOwner(owner: string): Promise<ListedSandbox[]> {
		// V2 sandboxes aren't returned by list() and have no tags — cross-run
		// enumeration relies on the run registry (sandboxIds) + each sandbox's
		// timeoutMs auto-expiry instead.
		if (v2) {
			return [];
		}
		const listed: ListedSandbox[] = [];
		for await (const sb of modal.sandboxes.list({ tags: { owner } })) {
			let tags: Record<string, string> = {};
			try {
				tags = await sb.getTags();
			} catch {
				/* tags unavailable — fall back to the sandbox id as the name */
			}
			listed.push({
				name: tags.name ?? sb.sandboxId,
				status: "running",
				createdAt: 0,
				tags,
			});
		}
		return listed;
	},

	isSandboxStreamClosed,
});

/** Classic V1 backend (tags, list, fromName, 5/s + 100-concurrent caps). */
export const modalProvider = makeModalProvider(false);
/** Experimental V2 backend (10k concurrent, 20+/s, no tags/list/fromName). */
export const modalV2Provider = makeModalProvider(true);
