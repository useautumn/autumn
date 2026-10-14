/**
 * Thin, typed wrappers over `@vercel/sandbox` for the `bun tw` cloud test swarm.
 *
 * See bun-tw-plan.md §8 (runner seam), §9/§9a (lifecycle + teardown), §10
 * (Vercel specifics + auth). These wrappers exist so the rest of the swarm
 * talks to a small, intention-revealing surface instead of the raw SDK, and so
 * the few places the real SDK diverges from the plan's assumptions are
 * documented in one spot.
 *
 * ## Auth (plan §10) — handled entirely by the SDK via env, nothing to wire here
 * The SDK's credential resolution reads the environment, so the orchestrator
 * only has to make sure ONE of these is present before calling in:
 *   - Local dev: `VERCEL_OIDC_TOKEN` (from `vercel env pull` → `.env.local`;
 *     expires after 12h — a `bun tw` run is minutes, well within).
 *   - CI / non-Vercel: `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`.
 * We never pass credentials explicitly; the SDK picks them up.
 *
 * ## SDK-vs-plan deltas (the "follow the REAL SDK" notes)
 *   - `Sandbox.fork({ sourceSandbox })` takes the source sandbox **name**
 *     (a string), NOT a `Sandbox` instance and NOT a `{ sourceSandbox: Sandbox }`.
 *     `forkWorker` therefore accepts the warm sandbox's NAME.
 *   - `fork()` does **not** support `source` and does **not** copy `env` — env is
 *     passed explicitly on every fork (plan §10). The public URL is not an env
 *     var (unknown at fork time); callers read it post-fork via `getPublicUrl`.
 *   - There is no `Sandbox.fork({ persistent })` distinct from create — both
 *     creation paths accept `persistent`, so workers fork with `persistent:false`.
 *   - `sandbox.snapshot()` returns a `Snapshot` whose id is `.snapshotId` (the
 *     plan calls it `warmSnapshotId`). The parent is stopped by the snapshot call.
 *   - Listing: `Sandbox.list` requires a `projectId` and is the only owner/tag
 *     filter the SDK exposes — it accepts `namePrefix` + `tags`, returns an
 *     async-iterable `Paginator`. We page it fully in `listSandboxesByOwner`.
 *   - Streaming: `runCommand` streams by piping into a `Writable` passed as
 *     `stdout`/`stderr` (there's no chunk callback); `runStreaming` adapts that
 *     to an `onChunk` callback and resolves with `{ exitCode, stderr }`.
 */

import { Writable } from "node:stream";
import { APIError, Sandbox, StreamError } from "@vercel/sandbox";
import {
	SANDBOX_NAME_PREFIX,
	SERVER_PORT,
	VERCEL_RUNTIME,
	WORKER_TIMEOUT_MS,
	WORKER_VCPUS,
} from "../constants.ts";
import type {
	CreateSandboxOptions,
	DetachedCommand,
	ProviderImpl,
	ProviderSandbox,
	RunDetachedOptions,
} from "./provider.ts";

export const TAG_OWNER = "owner";
export const TAG_RUN = "run";
export const TAG_KIND = "kind";
export const TAG_KIND_VALUE = "bun-tw";

export type CreateWarmSandboxOptions = {
	name: string;
	tags: Record<string, string>;
	env: Record<string, string>;
	source?: {
		url: string;
		revision: string;
		username?: string;
		password?: string;
	};
	ports?: number[];
	timeout?: number;
	vcpus?: number;
	signal?: AbortSignal;
};

/**
 * Create the long-lived warm parent sandbox the swarm forks workers from.
 *
 * `persistent: true` so the filesystem is retained up to the `snapshot()` call.
 *
 * SDK note: there is NO region parameter on create/fork — Vercel Sandbox only
 * runs in `iad1` (plan §10), so the `VERCEL_REGION` constant is documentation;
 * the SDK places the sandbox there implicitly.
 */
export const createWarmSandbox = async (
	opts: CreateWarmSandboxOptions,
): Promise<Sandbox> => {
	const gitSource = opts.source
		? opts.source.username && opts.source.password
			? {
					type: "git" as const,
					url: opts.source.url,
					username: opts.source.username,
					password: opts.source.password,
					revision: opts.source.revision,
				}
			: {
					type: "git" as const,
					url: opts.source.url,
					revision: opts.source.revision,
				}
		: undefined;
	const sandbox = await Sandbox.create({
		name: opts.name,
		runtime: VERCEL_RUNTIME,
		source: gitSource,
		ports: opts.ports ?? [SERVER_PORT],
		timeout: opts.timeout ?? WORKER_TIMEOUT_MS,
		resources: { vcpus: opts.vcpus ?? WORKER_VCPUS },
		tags: opts.tags,
		env: opts.env,
		persistent: true,
		signal: opts.signal,
	});
	return sandbox;
};

export const snapshotAndStop = async (
	sandbox: Sandbox,
	opts?: { signal?: AbortSignal },
): Promise<string> => {
	const snapshot = await sandbox.snapshot({ signal: opts?.signal });
	return snapshot.snapshotId;
};

export type ForkWorkerOptions = {
	sourceSandbox: string;
	name: string;
	env: Record<string, string>;
	tags: Record<string, string>;
	ports?: number[];
	timeout?: number;
	vcpus?: number;
	signal?: AbortSignal;
};

export const forkWorker = async (opts: ForkWorkerOptions): Promise<Sandbox> => {
	const sandbox = await Sandbox.fork({
		sourceSandbox: opts.sourceSandbox,
		name: opts.name,
		ports: opts.ports ?? [SERVER_PORT],
		timeout: opts.timeout ?? WORKER_TIMEOUT_MS,
		resources: { vcpus: opts.vcpus ?? WORKER_VCPUS },
		tags: opts.tags,
		env: opts.env,
		persistent: false,
		signal: opts.signal,
	});
	return sandbox;
};

/**
 * Resolve the per-port public HTTPS URL for a sandbox (plan §6a / §10): the
 * inbound Stripe webhook target. The port must have been declared in `ports`
 * at create/fork time or `domain()` throws.
 */
export const getPublicUrl = (
	sandbox: Sandbox,
	port: number = SERVER_PORT,
): string => sandbox.domain(port);

/**
 * The `@vercel/sandbox` stream-error code raised when a sandbox's command log
 * stream is closed out from under a still-iterating reader — exactly what
 * happens when teardown deletes a sandbox while its detached boot/ingress logs
 * are still streaming. It is a benign end-of-stream, NOT a command failure.
 */
const SANDBOX_STREAM_CLOSED_CODE = "sandbox_stream_closed";

export const isSandboxStreamClosed = (error: unknown): boolean => {
	if (error instanceof StreamError) {
		return true;
	}
	const code = (error as { code?: unknown } | undefined)?.code;
	if (code === SANDBOX_STREAM_CLOSED_CODE) {
		return true;
	}
	// Vercel's `cmd.logs()` paginator occasionally fails to decompress a log
	if (code === "BrotliDecompressionError") {
		return true;
	}
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	return (
		message.includes("Sandbox stream was closed") ||
		message.includes("BrotliDecompressionError") ||
		// Bun's generic wording when an in-flight SDK `fetch` (log stream, status
		message.includes("socket connection was closed unexpectedly")
	);
};

export type RunStreamingResult = {
	exitCode: number;
	stderr: string;
};

export const runStreaming = async (
	sandbox: Sandbox,
	argv: string[],
	onChunk: (text: string) => void,
	opts?: {
		env?: Record<string, string>;
		signal?: AbortSignal;
		swallowStreamClose?: boolean;
	},
): Promise<RunStreamingResult> => {
	const [cmd, ...args] = argv;
	if (!cmd) {
		throw new Error("runStreaming: argv must contain at least the command");
	}

	let stderr = "";

	const makeSink = (captureStderr: boolean): Writable =>
		new Writable({
			write(chunk, _encoding, callback) {
				const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
				if (captureStderr) {
					stderr += text;
				}
				onChunk(text);
				callback();
			},
		});

	try {
		const finished = await sandbox.runCommand({
			cmd,
			args,
			env: opts?.env,
			stdout: makeSink(false),
			stderr: makeSink(true),
			signal: opts?.signal,
		});

		return { exitCode: finished.exitCode, stderr };
	} catch (error) {
		if (opts?.swallowStreamClose && isSandboxStreamClosed(error)) {
			return { exitCode: -1, stderr };
		}
		throw error;
	}
};

export const getSandboxByName = async (
	name: string,
): Promise<Sandbox | undefined> => {
	try {
		return await Sandbox.get({ name, resume: false });
	} catch (error) {
		if (isAlreadyGone(error)) {
			return undefined;
		}
		throw error;
	}
};

export const deleteSandbox = async (
	sandboxOrName: Sandbox | string,
	opts?: { signal?: AbortSignal },
): Promise<void> => {
	try {
		const sandbox =
			typeof sandboxOrName === "string"
				? await Sandbox.get({ name: sandboxOrName, signal: opts?.signal })
				: sandboxOrName;
		await sandbox.delete({ signal: opts?.signal });
	} catch (error) {
		if (isAlreadyGone(error)) {
			return;
		}
		throw error;
	}
};

export type ListedSandbox = {
	name: string;
	status:
		| "failed"
		| "aborted"
		| "pending"
		| "running"
		| "stopping"
		| "stopped"
		| "snapshotting";
	createdAt: number;
	tags?: Record<string, string>;
};

export const listSandboxesByOwner = async (
	owner: string,
	opts?: { projectId?: string; signal?: AbortSignal },
): Promise<ListedSandbox[]> => {
	const projectId = opts?.projectId ?? process.env.VERCEL_PROJECT_ID;
	if (!projectId) {
		throw new Error(
			"listSandboxesByOwner: VERCEL_PROJECT_ID is required (set it in env or pass projectId)",
		);
	}

	const namePrefix = `${SANDBOX_NAME_PREFIX}-${owner}-`;

	const byName = new Map<string, ListedSandbox>();

	const collect = async (
		paginator: AsyncIterable<{
			name: string;
			status: ListedSandbox["status"];
			createdAt: number;
			tags?: Record<string, string>;
		}>,
	): Promise<void> => {
		for await (const sandbox of paginator) {
			if (!byName.has(sandbox.name)) {
				byName.set(sandbox.name, {
					name: sandbox.name,
					status: sandbox.status,
					createdAt: sandbox.createdAt,
					tags: sandbox.tags,
				});
			}
		}
	};

	const [byPrefix, byTags] = await Promise.all([
		Sandbox.list({ projectId, namePrefix, signal: opts?.signal }),
		Sandbox.list({
			projectId,
			tags: { [TAG_KIND]: TAG_KIND_VALUE, [TAG_OWNER]: owner },
			signal: opts?.signal,
		}),
	]);

	await collect(byPrefix);
	await collect(byTags);

	return Array.from(byName.values());
};

const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

/**
 * Detect a "this resource no longer exists" error so teardown stays idempotent
 * (plan §9a — tolerant of already-deleted resources).
 *
 * The real `@vercel/sandbox` `APIError` carries the HTTP status on
 * `error.response.status` (NOT a top-level `status`/`code`) and the slug on
 * `error.json?.error?.code` (NOT a top-level `code`). We match those exact
 * shapes: a 404/410 response, or an error code that ends in `not_found`.
 */
const isAlreadyGone = (error: unknown): boolean => {
	if (!(error instanceof APIError)) {
		return false;
	}
	const status = error.response?.status;
	if (status === HTTP_NOT_FOUND || status === HTTP_GONE) {
		return true;
	}
	const code = (error.json as { error?: { code?: string } } | undefined)?.error
		?.code;
	return typeof code === "string" && code.endsWith("not_found");
};

const wrap = (s: Sandbox): ProviderSandbox => ({ name: s.name, handle: s });
const unwrap = (s: ProviderSandbox): Sandbox => s.handle as Sandbox;

const gitSourceOf = (source: CreateSandboxOptions["source"]) =>
	source
		? source.username && source.password
			? {
					type: "git" as const,
					url: source.url,
					username: source.username,
					password: source.password,
					revision: source.revision,
				}
			: { type: "git" as const, url: source.url, revision: source.revision }
		: undefined;

const detachedSink = (onChunk: (text: string) => void): Writable =>
	new Writable({
		write(chunk, _encoding, callback) {
			onChunk(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
			callback();
		},
	});

export const vercelProvider: ProviderImpl = {
	createWarmSandbox: async (o) => wrap(await createWarmSandbox(o)),
	forkWorker: async (o) => wrap(await forkWorker(o)),
	snapshotAndStop: (s, o) => snapshotAndStop(unwrap(s), o),
	getPublicUrl: (s, port) => Promise.resolve(getPublicUrl(unwrap(s), port)),
	getSandboxByName: async (name) => {
		const s = await getSandboxByName(name);
		return s ? wrap(s) : undefined;
	},
	deleteSandbox: (s, o) =>
		deleteSandbox(typeof s === "string" ? s : unwrap(s), o),
	runStreaming: (s, argv, onChunk, o) =>
		runStreaming(unwrap(s), argv, onChunk, o),
	listSandboxesByOwner,
	isSandboxStreamClosed,

	createIngressSandbox: async (o: CreateSandboxOptions) =>
		wrap(
			await Sandbox.create({
				name: o.name,
				runtime: VERCEL_RUNTIME,
				source: gitSourceOf(o.source),
				ports: o.ports ?? [SERVER_PORT],
				timeout: o.timeout ?? WORKER_TIMEOUT_MS,
				resources: { vcpus: o.vcpus ?? 1 },
				tags: o.tags,
				env: o.env,
				persistent: false,
				signal: o.signal,
			}),
		),

	runDetached: async (
		s: ProviderSandbox,
		argv: string[],
		o: RunDetachedOptions,
	): Promise<DetachedCommand> => {
		const [cmd, ...args] = argv;
		const command = await unwrap(s).runCommand({
			cmd: cmd as string,
			args,
			cwd: o.cwd,
			env: o.env,
			detached: true,
			stdout: detachedSink(o.onChunk),
			stderr: detachedSink(o.onChunk),
			signal: o.signal,
		});
		return {
			wait: async (w) => ({ exitCode: (await command.wait(w)).exitCode }),
		};
	},
};
