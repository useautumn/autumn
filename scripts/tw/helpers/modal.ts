/**
 * Modal backend for the provider seam (helpers/provider.ts).
 *
 * Implements `ProviderImpl` over the `modal` SDK (v0.8.0), using the patterns
 * proven in `scripts/tw/modal-spike/` (create ~180ms, paced fan-out, goaws SQS).
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
 *   - **forkWorker** — `sandboxes.create(app, warmImage, …)` from the stored warm
 *     snapshot, `encryptedPorts:[SERVER_PORT]` for the tunnel. Paced (120 burst +
 *     ~4.5/s) to stay under the 5/s create limit; ≤90 fits the 100-concurrent cap.
 *   - **boot** — run.ts execs `bun boot.ts` detached (same as Vercel); Modal exec
 *     returns a process handle immediately and does NOT block on long-lived procs.
 *   - **getPublicUrl** — `sb.tunnels()[port].url`. **deleteSandbox** — `sb.terminate()`.
 *
 * ## Not yet validated end-to-end (first live runs check these)
 * warmup migrate/seed on the Debian image · server boot · per-worker tunnels +
 * Stripe · `bun test` exec · teardown. The wiring is from proven primitives.
 */
import { type App, type Image, ModalClient, type Sandbox } from "modal";
import { INGRESS_PORT, SERVER_PORT, WORKER_TIMEOUT_MS } from "../constants.ts";
import { buildBaseImage } from "./modalImage.ts";
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
/** The Modal App all swarm sandboxes live under (one per Modal workspace). */
const APP_NAME = "autumn-tw";
/** Memory per worker — ~matches a Vercel 2-vCPU µVM (2048 MiB/vCPU). */
const WORKER_MEMORY_MIB = 4096;
const WORKER_CPU = 2;
const INGRESS_MEMORY_MIB = 1024;

const modal = new ModalClient();

let appPromise: Promise<App> | undefined;
const getApp = (): Promise<App> => {
	appPromise ??= modal.apps.fromName(APP_NAME, { createIfMissing: true });
	return appPromise;
};

let baseImagePromise: Promise<Image> | undefined;
const getBaseImage = (): Promise<Image> => {
	baseImagePromise ??= getApp().then((app) => buildBaseImage(modal, app));
	return baseImagePromise;
};

/** Warm snapshot images keyed by warm sandbox name (forkWorker restores these). */
const warmImageByName = new Map<string, Image>();
/** Live sandboxes created this process — teardown-by-name resolves through here. */
const sandboxByName = new Map<string, Sandbox>();

const wrap = (name: string, handle: Sandbox): ProviderSandbox => ({
	name,
	handle,
});
const unwrap = (sandbox: ProviderSandbox): Sandbox => sandbox.handle as Sandbox;

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

/** Clone the repo into /repo at the ref (Modal create doesn't clone git). */
const cloneRepo = async (
	sandbox: Sandbox,
	source: GitSource,
): Promise<void> => {
	const url =
		source.username && source.password
			? source.url.replace(
					/^https:\/\//,
					`https://${encodeURIComponent(source.username)}:${encodeURIComponent(source.password)}@`,
				)
			: source.url;
	// Full clone (not shallow) so a non-default revision (e.g. feat/*) resolves;
	// warmup.sh's own `git checkout <ref>` is then a no-op.
	const script =
		`set -e; rm -rf ${MODAL_REPO_ROOT}; git clone ${url} ${MODAL_REPO_ROOT}; ` +
		`git -C ${MODAL_REPO_ROOT} checkout ${source.revision}`;
	// Run from `/` (always exists): the sandbox's default workdir is /repo, which
	// doesn't exist until THIS clone creates it — execing there fails with
	// "Unable to read current working directory".
	const proc = await sandbox.exec(["bash", "-lc", script], {
		stdout: "pipe",
		stderr: "pipe",
		workdir: "/",
	});
	const stderrText = await proc.stderr.readText().catch(() => "");
	await proc.stdout.readText().catch(() => "");
	const exitCode = await proc.wait();
	if (exitCode !== 0) {
		throw new Error(
			`modal: git clone failed (exit ${exitCode}): ${stderrText}`,
		);
	}
};

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
): Promise<Sandbox> => {
	const app = await getApp();
	await pace();
	const sandbox = await modal.sandboxes.create(app, image, {
		cpu: opts.cpu,
		memoryMiB: opts.memoryMiB,
		timeoutMs: opts.timeout ?? WORKER_TIMEOUT_MS,
		command: ["sleep", "infinity"],
		env: opts.env,
		tags: tagsWithName(opts.name, opts.tags),
		name: opts.name,
		workdir: MODAL_REPO_ROOT,
		encryptedPorts: opts.encryptedPorts,
	});
	sandboxByName.set(opts.name, sandbox);
	return sandbox;
};

export const modalProvider: ProviderImpl = {
	async createWarmSandbox(
		opts: CreateSandboxOptions,
	): Promise<ProviderSandbox> {
		const image = await getBaseImage();
		const sandbox = await createFromImage(image, {
			name: opts.name,
			env: opts.env,
			tags: opts.tags,
			cpu: opts.vcpus ?? WORKER_CPU,
			memoryMiB: WORKER_MEMORY_MIB,
			timeout: opts.timeout,
			encryptedPorts: opts.ports ?? [SERVER_PORT],
		});
		if (opts.source) {
			await cloneRepo(sandbox, opts.source);
		}
		return wrap(opts.name, sandbox);
	},

	async createIngressSandbox(
		opts: CreateSandboxOptions,
	): Promise<ProviderSandbox> {
		const image = await getBaseImage();
		const sandbox = await createFromImage(image, {
			name: opts.name,
			env: opts.env,
			tags: opts.tags,
			cpu: opts.vcpus ?? 1,
			memoryMiB: INGRESS_MEMORY_MIB,
			timeout: opts.timeout,
			encryptedPorts: opts.ports ?? [INGRESS_PORT],
		});
		if (opts.source) {
			await cloneRepo(sandbox, opts.source);
		}
		return wrap(opts.name, sandbox);
	},

	async forkWorker(opts: ForkWorkerOptions): Promise<ProviderSandbox> {
		const image = warmImageByName.get(opts.sourceSandbox);
		if (!image) {
			throw new Error(
				`modal: no warm snapshot for "${opts.sourceSandbox}" — snapshotAndStop must run first`,
			);
		}
		const sandbox = await createFromImage(image, {
			name: opts.name,
			env: opts.env,
			tags: opts.tags,
			cpu: opts.vcpus ?? WORKER_CPU,
			memoryMiB: WORKER_MEMORY_MIB,
			timeout: opts.timeout,
			encryptedPorts: opts.ports ?? [SERVER_PORT],
		});
		return wrap(opts.name, sandbox);
	},

	async snapshotAndStop(sandbox: ProviderSandbox): Promise<string> {
		const sb = unwrap(sandbox);
		// Services were clean-stopped by warmup.sh; capture the filesystem (migrated
		// PGDATA + node_modules + /repo). Workers fork from this Image.
		const image = await sb.snapshotFilesystem();
		warmImageByName.set(sandbox.name, image);
		// The warm parent is no longer needed (forks use the Image) — free its slot.
		await sb.terminate().catch(() => {
			/* best-effort */
		});
		sandboxByName.delete(sandbox.name);
		return image.imageId;
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
		const local = sandboxByName.get(name);
		if (local) {
			return wrap(name, local);
		}
		// No cross-run warm cache on Modal yet (the warm parent is terminated after
		// snapshot, so fromName won't find it) → undefined makes run.ts build fresh.
		try {
			const sb = await modal.sandboxes.fromName(APP_NAME, name);
			return wrap(name, sb);
		} catch {
			return undefined;
		}
	},

	async deleteSandbox(sandboxOrName: ProviderSandbox | string): Promise<void> {
		const name =
			typeof sandboxOrName === "string" ? sandboxOrName : sandboxOrName.name;
		let target: Sandbox | undefined =
			typeof sandboxOrName === "string"
				? sandboxByName.get(name)
				: unwrap(sandboxOrName);
		if (!target) {
			target = await modal.sandboxes
				.fromName(APP_NAME, name)
				.catch(() => undefined);
		}
		if (target) {
			await target.terminate().catch(() => {
				/* already gone */
			});
		}
		sandboxByName.delete(name);
		warmImageByName.delete(name);
	},

	async runStreaming(
		sandbox: ProviderSandbox,
		argv: string[],
		onChunk: (text: string) => void,
		opts?: RunStreamingOptions,
	): Promise<RunStreamingResult> {
		const proc = await unwrap(sandbox).exec(argv, {
			stdout: "pipe",
			stderr: "pipe",
			workdir: MODAL_REPO_ROOT,
			env: opts?.env,
		});
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
			if (
				!(
					opts?.swallowStreamClose && modalProvider.isSandboxStreamClosed(error)
				)
			) {
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
		const proc = await unwrap(sandbox).exec(argv, {
			stdout: "pipe",
			stderr: "pipe",
			workdir: opts.cwd ?? MODAL_REPO_ROOT,
			env: opts.env,
		});
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

	isSandboxStreamClosed(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return /terminated|already (completed|finished)|stream (closed|error)|connection (closed|reset)|ECONNRESET|UNAVAILABLE|task .* (exited|gone)/i.test(
			message,
		);
	},
};
