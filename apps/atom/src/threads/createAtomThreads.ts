import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { AtomServer } from "../init/types/atomServer.js";
import type {
	PeerPorts,
	ThreadControl,
	ThreadStatus,
} from "./types/threadMessages.js";

/** How long a thread that died stays down before another takes its place, so one that cannot start does not spin. */
const RESTART_DELAY_MS = 1000;

type AtomThreadsContext = {
	/** A worker running this program again: off the main thread, it runs `runAtomThread`. */
	spawnThread(): Worker;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
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
	const transfer =
		control.type === "peerJoined"
			? [control.ports.calls, control.ports.answers]
			: [];
	worker.postMessage(control, transfer);
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
 * it starts the threads, wires each pair, and replaces one that dies, telling the others while it is gone.
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

	/** Wired to every thread already running; those still to start wire themselves to it the same way. */
	async function startThread({ index }: { index: number }): Promise<void> {
		const worker = ctx.spawnThread();
		threads[index] = worker;
		const ready = readyOf({ worker });
		send({
			worker,
			control: { type: "init", index, env, bootedAt, restarts },
		});
		threads.forEach((peer, peerIndex) => {
			if (!peer || peerIndex === index) return;
			const { mine, theirs } = createPeerPorts();
			send({
				worker,
				control: { type: "peerJoined", index: peerIndex, ports: mine },
			});
			send({
				worker: peer,
				control: { type: "peerJoined", index, ports: theirs },
			});
		});
		try {
			await ready;
		} catch (error) {
			removeThread({ index });
			throw error;
		}
		worker.addEventListener("close", () => replaceThread({ index, worker }));
	}

	function removeThread({ index }: { index: number }): void {
		threads[index] = null;
		for (const peer of threads)
			if (peer) send({ worker: peer, control: { type: "peerLeft", index } });
	}

	/** Its customers get 503s until the new thread is ready; it keeps trying at the restart pace. */
	async function replaceThread({
		index,
		worker,
	}: {
		index: number;
		worker: Worker;
	}): Promise<void> {
		if (stopping || threads[index] !== worker) return;
		removeThread({ index });
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
				send({ worker, control: { type: "stop" } });
				await stopped;
				worker.terminate();
			}),
		);
	}

	return { start, stop };
};
