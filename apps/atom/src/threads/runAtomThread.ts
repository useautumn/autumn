import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { CATALOG_PUSH, SUBJECT_PUSH } from "../pushes/applyPushes.js";
import {
	catchUpFromPeers,
	SETTLE_CATCH_UPS_MS,
} from "../replication/catchUp/catchUpFromPeers.js";
import { createReplication } from "../replication/createReplication.js";
import { createHandlerRegistry } from "../replication/handlers/createHandlerRegistry.js";
import { answerOwnerCalls } from "./owners/answerOwnerCalls.js";
import { createSlotOwners } from "./owners/createSlotOwners.js";
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
	const logger = getAtomLogger();
	const owners = createSlotOwners({ index, threads: env.ATOM_THREADS });
	const { auth, multiTenant, held } = openAuth({ env, owners });
	const answerPorts = new Map<number, MessagePort>();
	const counters = openThreadCounters({ buffer: init.stats, index });
	// Only an org's own Atom has replicas to keep in step; a multi-tenant one holds every folder itself.
	const replication =
		env.ATOM_MODE === "deployed"
			? openReplication({ env, counters, logger })
			: undefined;
	let stopping = false;
	const server = createAtomServer({
		ctx: {
			auth,
			multiTenant,
			logger,
			health: {
				bootedAt: init.bootedAt,
				restarts: new Int32Array(init.restarts),
				ready: new Int32Array(init.ready),
				threadStats: init.stats,
			},
			counters,
			held,
			replication,
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

	/** Listens first, so peers can relay to it, then copies what it missed before reporting ready. */
	async function start(): Promise<void> {
		await server.start();
		const slots = auth.slotsFor({ atomId: null });
		if (!replication || !slots) return;
		const ctx = {
			replication,
			port: env.ATOM_PORT,
			tokenHash: env.ATOM_TOKEN_HASH,
			logger,
		};
		await catchUpFromPeers({ ctx, slots });
		// Peers learn this replica's address a little after it serves; later passes cover what they relayed elsewhere meanwhile.
		void (async () => {
			for (const delayMs of SETTLE_CATCH_UPS_MS) {
				await Bun.sleep(delayMs);
				if (stopping) return;
				await catchUpFromPeers({ ctx, slots });
			}
		})();
	}

	async function stop(): Promise<void> {
		stopping = true;
		await server.stop();
	}

	return { start, stop, join, leave };
};

/** The pushes this thread applies, on their way to every other replica. */
const openReplication = ({
	env,
	counters,
	logger,
}: {
	env: ThreadInit["env"];
	counters: ReturnType<typeof openThreadCounters>;
	logger: ReturnType<typeof getAtomLogger>;
}) => {
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(CATALOG_PUSH);
	return createReplication({
		ctx: {
			tokenHash: env.ATOM_TOKEN_HASH,
			port: env.ATOM_PORT,
			registry,
			counters,
			logger,
		},
	});
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
