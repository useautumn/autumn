import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { answerOwnerCalls } from "./owners/answerOwnerCalls.js";
import { createSlotOwners } from "./owners/createSlotOwners.js";
import { openCheckCounts } from "./stats/checkCounts.js";
import { openThreadCounters } from "./stats/threadStats.js";
import type {
	PeerPorts,
	ThreadControl,
	ThreadInit,
	ThreadStatus,
} from "./types/threadMessages.js";

/** One serving thread: its server, and its lines to the other threads, kept current as they come and go. */
const openThread = ({ init }: { init: ThreadInit }) => {
	const { env, index } = init;
	const owners = createSlotOwners({ index, threads: env.ATOM_THREADS });
	const { auth, multiTenant, held } = openAuth({ env, owners });
	const answerPorts = new Map<number, MessagePort>();
	const server = createAtomServer({
		ctx: {
			auth,
			multiTenant,
			logger: getAtomLogger(),
			health: {
				bootedAt: init.bootedAt,
				restarts: new Int32Array(init.restarts),
				threadStats: init.stats,
				checkCounts: init.checkCounts,
			},
			counters: openThreadCounters({ buffer: init.stats, index }),
			checkCounts: openCheckCounts({ buffer: init.checkCounts, index }),
			held,
		},
		config: {
			env,
			// The highest-indexed threads receive: slots go round-robin from 0, so the lowest own one more.
			receivesPushes: index >= env.ATOM_THREADS - env.ATOM_PUSH_RECEIVERS,
		},
	});

	function join({ peer, ports }: { peer: number; ports: PeerPorts }): void {
		owners.connect({ thread: peer, port: ports.calls });
		answerOwnerCalls({ ctx: { auth }, port: ports.answers });
		answerPorts.set(peer, ports.answers);
	}

	function leave({ peer }: { peer: number }): void {
		owners.disconnect({ thread: peer });
		answerPorts.get(peer)?.close();
		answerPorts.delete(peer);
	}

	return { start: server.start, stop: server.stop, join, leave };
};

/** Runs in a worker the main thread started: everything it does is told to it, in order, over its parent port. */
export const runAtomThread = (): void => {
	const main = parentPort;
	if (!main) throw new Error("runAtomThread runs in a worker thread");
	const report = (status: ThreadStatus) => main.postMessage(status);
	let thread: ReturnType<typeof openThread> | undefined;

	async function receive(control: ThreadControl): Promise<void> {
		if (control.type === "init") {
			thread = openThread({ init: control });
			await thread.start();
			report({ type: "ready" });
		} else if (control.type === "peerJoined")
			thread?.join({ peer: control.index, ports: control.ports });
		else if (control.type === "peerLeft")
			thread?.leave({ peer: control.index });
		else {
			await thread?.stop();
			report({ type: "stopped" });
		}
	}

	// A failure here ends the thread, so the main thread replaces it; it is logged first, whatever Bun does with the rejection.
	main.on("message", (control: ThreadControl) =>
		receive(control).catch((error) => {
			getAtomLogger().error(
				{ error, type: "atom_thread_failed", data: { control: control.type } },
				"An Atom thread failed",
			);
			throw error;
		}),
	);
};
