import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { AtomServer } from "../init/types/atomServer.js";
import type { ThreadControl, ThreadStatus } from "./types/threadMessages.js";

/** How long a thread that died stays down before another takes its place, so one that cannot start does not spin. */
const RESTART_DELAY_MS = 1000;

type AtomThreadsContext = {
	/** A worker running this program again: off the main thread, it runs `runAtomThread`. */
	spawnThread(): Worker;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};

/** Settles on the thread's first word: ready, or gone before it got there. */
const readyOf = ({ worker }: { worker: Worker }): Promise<void> =>
	new Promise((resolve, reject) => {
		worker.addEventListener("message", (event: MessageEvent<ThreadStatus>) => {
			if (event.data.type === "ready") resolve();
		});
		worker.addEventListener("close", () =>
			reject(new Error("An Atom thread stopped before it was ready")),
		);
	});

const stoppedOf = ({ worker }: { worker: Worker }): Promise<void> =>
	new Promise((resolve) => {
		worker.addEventListener("message", (event: MessageEvent<ThreadStatus>) => {
			if (event.data.type === "stopped") resolve();
		});
		worker.addEventListener("close", () => resolve());
	});

/**
 * Runs the Atom as `ATOM_THREADS` threads of one process sharing the port. The main thread serves nothing:
 * it starts the threads and replaces one that dies.
 */
export const createAtomThreads = ({
	ctx,
	config,
}: {
	ctx: AtomThreadsContext;
	config: { env: AtomEnv };
}): AtomServer => {
	const { env } = config;
	const threads: (Worker | null)[] = Array(env.ATOM_THREADS).fill(null);
	const bootedAt = new Date().toISOString();
	const restarts = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	let stopping = false;

	async function startThread({ index }: { index: number }): Promise<void> {
		const worker = ctx.spawnThread();
		threads[index] = worker;
		worker.addEventListener("error", (event: ErrorEvent) =>
			ctx.logger.error(
				{ type: "atom_thread_failed", error: event.error, data: { index } },
				`Atom thread ${index} failed: ${event.message}`,
			),
		);
		const ready = readyOf({ worker });
		const init: ThreadControl = {
			type: "init",
			index,
			env,
			bootedAt,
			restarts,
		};
		worker.postMessage(init);
		try {
			await ready;
		} catch (error) {
			threads[index] = null;
			throw error;
		}
		worker.addEventListener("close", () => replaceThread({ index, worker }));
	}

	/** The other threads keep serving meanwhile; it keeps trying at the restart pace. */
	async function replaceThread({
		index,
		worker,
	}: {
		index: number;
		worker: Worker;
	}): Promise<void> {
		if (stopping || threads[index] !== worker) return;
		threads[index] = null;
		ctx.logger.warn(
			{ type: "atom_thread_died", data: { index } },
			"An Atom thread died; starting another in its place",
		);
		while (!stopping) {
			await Bun.sleep(RESTART_DELAY_MS);
			if (stopping) return;
			try {
				await startThread({ index });
				Atomics.add(new Int32Array(restarts), 0, 1);
				return;
			} catch (error) {
				ctx.logger.error(
					{ type: "atom_thread_start_failed", error, data: { index } },
					"An Atom thread could not be started; trying again",
				);
			}
		}
	}

	/** A thread that cannot start takes the others down: a half-started Atom is not left serving. */
	async function start(): Promise<void> {
		try {
			await Promise.all(threads.map((_, index) => startThread({ index })));
		} catch (error) {
			await stop();
			throw error;
		}
		ctx.logger.info(
			`Atom listening at http://${env.ATOM_HOSTNAME}:${env.ATOM_PORT} on ${env.ATOM_THREADS} threads`,
		);
	}

	/** Each thread finishes its in-flight requests and closes its files before it ends. */
	async function stop(): Promise<void> {
		stopping = true;
		const running = threads.filter((worker): worker is Worker => !!worker);
		await Promise.all(
			running.map(async (worker) => {
				const stopped = stoppedOf({ worker });
				worker.postMessage({ type: "stop" } satisfies ThreadControl);
				await stopped;
				worker.terminate();
			}),
		);
	}

	return { start, stop };
};
