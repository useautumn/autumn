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

/** Tag keys stamped on every swarm-created sandbox (plan §9a ownership tagging). */
export const TAG_OWNER = "owner";
export const TAG_RUN = "run";
export const TAG_KIND = "kind";
/** Constant value for the `kind` tag — the tag-sweep fallback selector. */
export const TAG_KIND_VALUE = "bun-tw";

/** Options for the warm parent sandbox (the one we snapshot then fork from). */
export type CreateWarmSandboxOptions = {
	/** Sandbox name, e.g. `tw-<owner>-<runId>-warm`. */
	name: string;
	/** Ownership tags (plan §9a): `{ owner, run, kind }`. */
	tags: Record<string, string>;
	/** Env baked into the warm sandbox while building. */
	env: Record<string, string>;
	/**
	 * Git source to clone into the warm parent at create (repo @ ref). Without
	 * this the sandbox is empty and `build-base.sh`/`warmup.sh` can't run.
	 * `username`/`password` are for a private repo (token as the password).
	 */
	source?: {
		url: string;
		revision: string;
		username?: string;
		password?: string;
	};
	/** Ports to expose; defaults to `[SERVER_PORT]` so `domain()` resolves. */
	ports?: number[];
	/** Sandbox lifetime in ms; defaults to {@link WORKER_TIMEOUT_MS}. */
	timeout?: number;
	/** vCPUs (→ 2048 MB each); defaults to {@link WORKER_VCPUS}. */
	vcpus?: number;
	/** Optional abort signal for cooperative cancellation. */
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
	// No `depth` — a shallow clone is single-branch, so a non-default `revision`
	// (e.g. feat/*) fails with git 128 (learned in the spike).
	const gitSource = opts.source
		? opts.source.username && opts.source.password
			? {
					type: "git" as const,
					url: opts.source.url,
					username: opts.source.username,
					password: opts.source.password,
					revision: opts.source.revision,
				}
			: { type: "git" as const, url: opts.source.url, revision: opts.source.revision }
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

/**
 * Snapshot the warm sandbox and return its snapshot id (plan §4b step 6 /
 * §9 step 3 → `warmSnapshotId`). The SDK stops the sandbox as part of taking the
 * snapshot, so the caller must have clean-stopped the stateful services first
 * (plan §4b step 5 — snapshots are filesystem-only, process memory is NOT kept).
 *
 * @returns The new snapshot's id, to feed every worker fork.
 */
export const snapshotAndStop = async (
	sandbox: Sandbox,
	opts?: { signal?: AbortSignal },
): Promise<string> => {
	const snapshot = await sandbox.snapshot({ signal: opts?.signal });
	return snapshot.snapshotId;
};

/** Options for forking one ephemeral worker off the warm sandbox. */
export type ForkWorkerOptions = {
	/**
	 * The NAME of the warm source sandbox to fork from (the SDK takes a name,
	 * not a `Sandbox` instance).
	 */
	sourceSandbox: string;
	/** This worker's sandbox name, e.g. `tw-<owner>-<runId>-<idx>`. */
	name: string;
	/** Per-worker env — `fork()` does NOT copy env, so it must be passed here. */
	env: Record<string, string>;
	/** Ownership tags (plan §9a). */
	tags: Record<string, string>;
	/** Ports to expose; defaults to `[SERVER_PORT]`. */
	ports?: number[];
	/** Sandbox lifetime in ms; defaults to {@link WORKER_TIMEOUT_MS}. */
	timeout?: number;
	/** vCPUs (→ 2048 MB each); defaults to {@link WORKER_VCPUS}. */
	vcpus?: number;
	/** Optional abort signal for cooperative cancellation. */
	signal?: AbortSignal;
};

/**
 * Fork one ephemeral worker from the warm sandbox (plan §4c / §9 step 4).
 *
 * `persistent: false` so workers don't auto-snapshot on stop (avoids N
 * accumulated snapshots). Env is passed explicitly (fork doesn't copy it).
 */
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

/**
 * Detect the "sandbox stream was closed" error so log-streaming loops can treat
 * it as a benign end-of-stream during teardown instead of letting it escape as
 * an uncaught throw. Matches the typed `StreamError` first, then falls back to
 * the error `code` / message so it still trips if the SDK surfaces a plain error.
 */
export const isSandboxStreamClosed = (error: unknown): boolean => {
	if (error instanceof StreamError) {
		return true;
	}
	const code = (error as { code?: unknown } | undefined)?.code;
	if (code === SANDBOX_STREAM_CLOSED_CODE) {
		return true;
	}
	const message =
		error instanceof Error ? error.message : typeof error === "string" ? error : "";
	return message.includes("Sandbox stream was closed");
};

/** Result of a streamed remote command. */
export type RunStreamingResult = {
	/** The exit code reported by the command on the worker (NOT the transport). */
	exitCode: number;
	/** Full stderr captured during the run. */
	stderr: string;
};

/**
 * Run a command on a sandbox, streaming combined stdout/stderr to `onChunk` as
 * the bytes arrive (plan §8.2 seam: the byte source for the existing parser).
 *
 * Both streams are forwarded to `onChunk` so the live parser sees everything in
 * arrival order (Bun's test runner writes its `(pass)`/`(fail)` lines to
 * stdout); stderr is additionally accumulated and returned for crash diagnosis.
 *
 * The returned `exitCode` is the code the command reported on the worker. A
 * worker dying mid-command (transport closed, no exit code) surfaces as a
 * thrown/rejected error from the SDK here — the caller (RemoteExecutor) maps
 * that to a {@link WorkerDeathError} (plan §8.4); this wrapper does not mask it.
 *
 * `swallowStreamClose` is opt-in: when set, a `sandbox_stream_closed`
 * {@link StreamError} (the sandbox was torn down while its logs were streaming)
 * is treated as a benign end-of-stream and resolves with the bytes seen so far
 * (exit code `-1`). The TEST path (RemoteExecutor) MUST leave it OFF so a
 * mid-run worker death still throws and triggers a reschedule (plan §8.4); only
 * the build-base / warmup phases — which run while the orchestrator may be
 * tearing the warm parent down — turn it on to silence teardown spam.
 *
 * @param argv `[cmd, ...args]` — the first element is the executable.
 */
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
		// Only swallow a stream-closed error for callers that opted in (boot/warmup
		// teardown), AND never for the test path: RemoteExecutor relies on this
		// throw to detect worker death mid-run. Treat the close as end-of-stream.
		if (opts?.swallowStreamClose && isSandboxStreamClosed(error)) {
			return { exitCode: -1, stderr };
		}
		throw error;
	}
};

/**
 * Delete a sandbox by instance or by name (plan §9a teardown step 4).
 *
 * Idempotent-friendly: a "not found"/already-deleted error is swallowed so the
 * teardown sequence can be re-run safely. Other errors propagate.
 */
/**
 * Look up a sandbox by name, returning `undefined` if it doesn't exist. Used to
 * detect a CACHED warm parent (named deterministically by ref-sha) so the swarm
 * can skip the build and fork straight from it.
 */
export const getSandboxByName = async (
	name: string,
): Promise<Sandbox | undefined> => {
	try {
		// `resume: false` — we only need to know it exists + fork from its snapshot;
		// don't spend compute starting the cached parent.
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

/** A sandbox surfaced by an owner/tag listing (the cleanup-recovery shape). */
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

/**
 * List this swarm's sandboxes for an owner (plan §9a `list` / `kill --orphans`
 * tag-sweep fallback). The SDK DOES support listing — `Sandbox.list` accepts
 * `namePrefix` + `tags` and returns an async-iterable `Paginator`, which we page
 * fully. Requires `VERCEL_PROJECT_ID` in env (the SDK reads it for `projectId`).
 *
 * Filters by the `owner` tag AND the `tw-<owner>-` name prefix so SIGKILL'd runs
 * that only got as far as a name (no tags) are still caught.
 */
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

	// `Sandbox.list` AND-filters `namePrefix` + `tags` server-side, but the sweep
	// wants an OR: a SIGKILL'd run may have a matching name but no/partial tags,
	// while a renamed/older sandbox may have the tags but not the name prefix.
	// Run two passes (name-only, tags-only) and union by sandbox name.
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

/** HTTP status codes that mean "this resource no longer exists". */
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
