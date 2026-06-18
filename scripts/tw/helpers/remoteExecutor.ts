/**
 * `RemoteExecutor` — the remote half of the `TestExecutor` seam (plan §8.2).
 *
 * The runner (`scripts/testScripts/runTestsV2.tsx`) keeps its `pLimit(N)`
 * window, parser, result model, retry phase and Ink TUI exactly as-is and only
 * delegates the *byte source* of one test file to a `TestExecutor`. Locally that
 * source is a spawned `bun test`; under `bun tw` it's this class, which runs the
 * same `bun test --timeout 0 [--test-name-pattern <pat>] <file>` command on a
 * pooled Vercel worker and streams the output back through `onChunk` into the
 * unchanged parser.
 *
 * Two non-local concerns it owns (plan §8.4 / §8.7):
 *   - **Retry on a different worker.** When `failedTestNames` is present (a retry
 *     or a reschedule), it acquires a worker that is preferably NOT the one that
 *     last ran the file, so a polluted/throttled µVM gets a clean shot.
 *   - **Worker death ≠ test failure.** If the worker dies mid-file (transport
 *     closed, no exit code), the command rejects without a real exit code. That
 *     is a transient infra fault, not a verdict, so it is re-thrown as a tagged
 *     {@link WorkerDeathError} and the dead worker is evicted from the pool. The
 *     runner reschedules attempt-preservingly (plan §8.4). A *clean* completion
 *     (real exit code, even non-zero) flows through the normal path.
 */

import type { Sandbox } from "@vercel/sandbox";
// NOTE: `TestExecutor` and `WorkerDeathError` are owned + exported by the
// runner-refactor step from `scripts/testScripts/testExecutor.ts` (see plan §8.2
// and tw/types.ts). They are imported (NOT redefined) here so the seam — including
// the `instanceof WorkerDeathError` check the runner uses to trigger an
// attempt-preserving reschedule — can't drift across module identities.
import {
	type TestExecutor,
	WorkerDeathError,
} from "../../testScripts/testExecutor.ts";
import type { WorkerHandle } from "../types.ts";
import type { WorkerPool } from "./pool.ts";
import { runStreaming } from "./vercel.ts";

/** How the executor maps a {@link WorkerHandle} to a live {@link Sandbox}. */
export type SandboxResolver = (worker: WorkerHandle) => Sandbox | undefined;

export type RemoteExecutorOptions = {
	/** The pool the executor checks workers out of (plan §8.7). */
	pool: WorkerPool;
	/**
	 * Resolve a live `Sandbox` for a worker handle. The dispatcher owns the
	 * `name → Sandbox` map (it created them); the executor only needs read
	 * access, so this is injected rather than baked into `WorkerHandle`.
	 */
	resolveSandbox: SandboxResolver;
	/**
	 * Repo-relative-to-worker path translator. The runner passes an absolute
	 * LOCAL path; the worker checked the repo out at a different root, so the
	 * file argument must be rewritten to the worker's layout (plan §8.5 "Paths").
	 * Defaults to identity when omitted (e.g. when the runner already hands a
	 * worker-relative path).
	 */
	toWorkerPath?: (localFile: string) => string;
};

/**
 * Build the Bun test argv for one file, mirroring the local runner exactly
 * (`runTestsV2.tsx`: `["bun","test","--timeout","0", (--test-name-pattern …),
 * file]`). When retrying specific failures, the names are OR-joined into a
 * single regex the way the local path does.
 */
export const buildTestArgv = (
	file: string,
	failedTestNames?: string[],
): string[] => {
	const argv = ["bun", "test", "--timeout", "0"];
	if (failedTestNames && failedTestNames.length > 0) {
		argv.push("--test-name-pattern", joinTestNamePattern(failedTestNames));
	}
	argv.push(file);
	return argv;
};

/**
 * Turn a set of failed test names into a single `--test-name-pattern` regex.
 * Names are escaped (Bun treats the pattern as a regex) and OR-joined. The
 * whole-file `(unnamed)` fallback is handled upstream by the runner (plan §8.3),
 * which simply omits `failedTestNames`, so this only ever sees real names.
 */
const joinTestNamePattern = (names: string[]): string =>
	names.map((name) => escapeRegex(name)).join("|");

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value: string): string =>
	value.replace(REGEX_SPECIAL_CHARS, "\\$&");

export class RemoteExecutor implements TestExecutor {
	private readonly pool: WorkerPool;
	private readonly resolveSandbox: SandboxResolver;
	private readonly toWorkerPath: (localFile: string) => string;

	/**
	 * Which worker last ran a given file, so a retry / reschedule can land on a
	 * DIFFERENT worker (plan §8.7). The `run()` signature (fixed by the
	 * `TestExecutor` seam) doesn't carry this, so the executor tracks it itself.
	 */
	private readonly lastWorkerByFile = new Map<string, string>();

	constructor(opts: RemoteExecutorOptions) {
		this.pool = opts.pool;
		this.resolveSandbox = opts.resolveSandbox;
		this.toWorkerPath = opts.toWorkerPath ?? ((file) => file);
	}

	/**
	 * Run one test file on a pooled worker and stream its output.
	 *
	 * @returns `{ exitCode, stderr }` from the test command on the worker (the
	 *   runner turns this into a `TestFileResult` exactly as in the local path).
	 * @throws {WorkerDeathError} if the worker dies mid-file (no exit code) — the
	 *   runner reschedules attempt-preservingly and the pool evicts the worker.
	 */
	async run(args: {
		file: string;
		failedTestNames?: string[];
		onChunk: (text: string) => void;
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }> {
		// A file is being RE-RUN whenever we've already tracked a worker for it —
		// either a test-failure retry (`failedTestNames` present, plan §8.3) OR a
		// worker-death reschedule (first-attempt file, `failedTestNames` undefined,
		// plan §8.4). On a worker-death reschedule `failedTestNames` is undefined,
		// so keying off it alone would wrongly land back on `acquire()` (the same
		// pool). Instead, key off whether we've seen this file before.
		const lastWorker = this.lastWorkerByFile.get(args.file);
		const isRerun = lastWorker !== undefined;

		// On a worker-death reschedule the previous worker is provably dead (it was
		// `markDead`'d), so a different worker is mandatory → strict. A test-failure
		// retry merely prefers a different worker. Either way `acquireDifferentFrom`
		// falls back to the same worker only when it's the only live one (N === 1).
		const isWorkerDeathReschedule = isRerun && args.failedTestNames === undefined;

		const worker = isRerun
			? await this.pool.acquireDifferentFrom(lastWorker, isWorkerDeathReschedule)
			: await this.pool.acquire();

		worker.lastFile = args.file;
		this.lastWorkerByFile.set(args.file, worker.name);

		try {
			const sandbox = this.resolveSandbox(worker);
			if (!sandbox) {
				// The handle exists but its sandbox is gone — treat as worker death so
				// the runner evicts it and reschedules onto a healthy worker (§8.4).
				throw new WorkerDeathError({
					file: args.file,
					workerName: worker.name,
				});
			}

			const argv = buildTestArgv(
				this.toWorkerPath(args.file),
				args.failedTestNames,
			);

			const { exitCode, stderr } = await runStreaming(
				sandbox,
				argv,
				args.onChunk,
				{ signal: args.signal },
			);
			// Clean completion (real exit code, even if non-zero) — the worker is
			// healthy, hand it back to the pool for the next file.
			this.pool.release(worker);
			return { exitCode, stderr };
		} catch (error) {
			// An AbortSignal-driven cancellation is intentional teardown, not a
			// worker death — release the (healthy) worker and propagate untouched.
			if (args.signal?.aborted) {
				this.pool.release(worker);
				throw error;
			}
			// A WorkerDeathError raised above (gone sandbox) is already correctly
			// classified; any other failure to obtain an exit code means the
			// transport/VM dropped, which is also worker death (plan §8.4).
			//
			// The worker is provably dead, so we evict it from the pool here BEFORE
			// throwing. We deliberately do NOT `release()` it (releasing would let
			// `pump()` hand a dead worker to another waiter). `markDead` removes it
			// from rotation and pumps the waiter queue, so any parked acquire
			// re-evaluates against the remaining healthy workers (or — if this was
			// the last worker — the pool stays empty and parked acquires fail/await
			// rather than hanging on a busy-forever zombie). For a 1-worker pool this
			// is what prevents the first death from deadlocking the whole run.
			const deathError =
				error instanceof WorkerDeathError
					? error
					: new WorkerDeathError({
							file: args.file,
							workerName: worker.name,
							cause: error,
						});
			this.pool.markDead(worker);
			throw deathError;
		}
	}
}
