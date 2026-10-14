import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import { startHealthLog } from "../init/startHealthLog.js";
import type { AtomServer } from "../init/types/atomServer.js";
import { MEMBERSHIP_INTS } from "../replicas/membership/createMembership.js";
import { getSqliteOpenLock } from "../state/newSqliteConnection.js";
import { removeUnreadableFiles } from "../state/removeUnreadableFiles.js";
import { createThreadStatsBuffer } from "./stats/threadStats.js";
import type {
	PeerPorts,
	ThreadControl,
	ThreadStatus,
} from "./types/threadMessages.js";

/** How long a thread that died stays down before another takes its place; doubled after each quick failure, up to the cap. */
const RESTART_DELAY_MS = 1000;
const MAX_RESTART_DELAY_MS = 30_000;
/** A thread that ran this long before it died is starting afresh, not looping: its next restart waits the shortest delay. */
const STEADY_MS = 60_000;

type AtomThreadsContext = {
	/** A worker running this program again: off the main thread, it runs `runAtomThread`. */
	spawnThread(): Worker;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	sleep?: (ms: number) => Promise<unknown>;
};

/** A channel per direction: each thread's calls and the other's answers never share a port. */
const createPeerPorts = (): { mine: PeerPorts; theirs: PeerPorts } => {
	const outbound = new MessageChannel();
	const inbound = new MessageChannel();
	return {
		mine: { calls: outbound.port1, answers: inbound.port2 },
		theirs: { calls: inbound.port1, answers: outbound.port2 },
	};
};

const send = ({
	worker,
	control,
}: {
	worker: Worker;
	control: ThreadControl;
}): void => {
	const lines =
		control.type === "peerJoined"
			? [control]
			: control.type === "init"
				? control.peers
				: [];
	const transfer = lines.flatMap(({ ports }) => [ports.calls, ports.answers]);
	try {
		worker.postMessage(control, transfer);
	} catch {
		// A worker already gone hears nothing more; its own close replaces it.
	}
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
 * Runs the Atom as `ATOM_THREADS` threads of one process sharing the port. The main thread serves nothing: it starts the
 * threads, wires each pair, keeps restarting one that fails or dies while the others serve, and logs their health.
 */
export const createAtomThreads = ({
	ctx,
	config,
}: {
	ctx: AtomThreadsContext;
	config: { env: AtomEnv };
}): AtomServer => {
	const { env } = config;
	const sleep = ctx.sleep ?? Bun.sleep;
	const threads: (Worker | null)[] = Array(env.ATOM_THREADS).fill(null);
	/** Per thread: failures since it last ran steadily, which set how long its next restart waits. */
	const failures: number[] = Array(env.ATOM_THREADS).fill(0);
	const bootedAt = new Date().toISOString();
	const restarts = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	const readyFlag = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	const threadsReady = new SharedArrayBuffer(
		env.ATOM_THREADS * Int32Array.BYTES_PER_ELEMENT,
	);
	const stats = createThreadStatsBuffer({ threads: env.ATOM_THREADS });
	const membership = new SharedArrayBuffer(
		MEMBERSHIP_INTS * Int32Array.BYTES_PER_ELEMENT,
	);
	let stopping = false;
	let healthLog: { stop(): void } | null = null;

	const restartDelayOf = ({ index }: { index: number }): number =>
		Math.min(
			RESTART_DELAY_MS * 2 ** Math.max(0, (failures[index] ?? 0) - 1),
			MAX_RESTART_DELAY_MS,
		);

	/** Wired to every thread already running; those still to start wire themselves to it the same way. */
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
		const peers = threads.flatMap((peer, peerIndex) => {
			if (!peer || peerIndex === index) return [];
			const { mine, theirs } = createPeerPorts();
			send({
				worker: peer,
				control: { type: "peerJoined", index, ports: theirs },
			});
			return [{ index: peerIndex, ports: mine }];
		});
		send({
			worker,
			control: {
				type: "init",
				index,
				env,
				bootedAt,
				restarts,
				ready: readyFlag,
				threadsReady,
				stats,
				membership,
				sqliteOpenLock: getSqliteOpenLock(),
				peers,
			},
		});
		try {
			await ready;
		} catch (error) {
			removeThread({ index });
			throw error;
		}
		const readyAt = performance.now();
		worker.addEventListener("close", () => {
			void replaceThread({ index, worker, readyAt }).catch((error) =>
				ctx.logger.error(
					{ type: "atom_thread_replace_failed", error, data: { index } },
					"An Atom thread could not be replaced",
				),
			);
		});
	}

	/** The others fail its pending calls at once (503s) instead of waiting on a thread that is gone. */
	function removeThread({ index }: { index: number }): void {
		threads[index] = null;
		Atomics.store(new Int32Array(threadsReady), index, 0);
		for (const peer of threads)
			if (peer) send({ worker: peer, control: { type: "peerLeft", index } });
	}

	/** Until one is ready, waiting longer after each failure: a thread that cannot start never spins, nor takes the others down. */
	async function keepStarting({ index }: { index: number }): Promise<boolean> {
		while (!stopping) {
			try {
				await startThread({ index });
				return true;
			} catch (error) {
				failures[index] = (failures[index] ?? 0) + 1;
				ctx.logger.error(
					{ type: "atom_thread_start_failed", error, data: { index } },
					"An Atom thread could not be started; trying again",
				);
				await sleep(restartDelayOf({ index }));
			}
		}
		return false;
	}

	/** Only its own customers get 503s, which the API answers, until the new thread has caught up; the others keep answering. */
	async function replaceThread({
		index,
		worker,
		readyAt,
	}: {
		index: number;
		worker: Worker;
		readyAt: number;
	}): Promise<void> {
		if (stopping || threads[index] !== worker) return;
		removeThread({ index });
		failures[index] =
			performance.now() - readyAt < STEADY_MS ? (failures[index] ?? 0) + 1 : 0;
		const delayMs = restartDelayOf({ index });
		ctx.logger.warn(
			{ type: "atom_thread_died", data: { index, delayMs } },
			"An Atom thread died; starting another in its place",
		);
		await sleep(delayMs);
		if (await keepStarting({ index }))
			Atomics.add(new Int32Array(restarts), 0, 1);
	}

	/** Resolves once every thread has started; one that fails is retried, so a half-started Atom answers 503s, never exits. */
	async function start(): Promise<void> {
		removeUnreadableFiles({ dataDir: env.ATOM_DATA_DIR, logger: ctx.logger });
		const started = await Promise.all(
			threads.map((_, index) => keepStarting({ index })),
		);
		if (!started.every(Boolean)) return;
		Atomics.store(new Int32Array(readyFlag), 0, 1);
		ctx.logger.info(
			{ type: "atom_ready", data: { bunVersion: Bun.version } },
			`Atom listening at http://${env.ATOM_HOSTNAME}:${env.ATOM_PORT} on ${env.ATOM_THREADS} threads (Bun ${Bun.version})`,
		);
		healthLog ??= startHealthLog({
			source: {
				bootedAt,
				restarts: new Int32Array(restarts),
				ready: new Int32Array(readyFlag),
				threadsReady: new Int32Array(threadsReady),
				threadStats: stats,
				dataDir: env.ATOM_DATA_DIR,
			},
			everyMs: env.ATOM_HEALTH_LOG_EVERY_MS,
			logger: ctx.logger,
		});
	}

	/** Each thread finishes its in-flight requests and closes its files before it ends; a call to one already gone fails at once. */
	async function stop(): Promise<void> {
		stopping = true;
		healthLog?.stop();
		healthLog = null;
		await Promise.all(
			threads.map(async (worker, index) => {
				if (!worker) return;
				const stopped = stoppedOf({ worker });
				send({ worker, control: { type: "stop" } });
				await stopped;
				removeThread({ index });
				worker.terminate();
			}),
		);
	}

	return { start, stop };
};
