import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import { getAutumnClient } from "../autumnClient/getAutumnClient.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { CATALOG_PUSH, SUBJECT_PUSH } from "../pushes/applyPushes.js";
import { createReplicaSync } from "../replication/createReplicaSync.js";
import { createReplication } from "../replication/createReplication.js";
import { createHandlerRegistry } from "../replication/handlers/createHandlerRegistry.js";
import type { Slots } from "../slots/types/slots.js";
import { createSubjectPulls } from "../subjectPulls/createSubjectPulls.js";
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
	const counters = openThreadCounters({ buffer: init.stats, index });
	// Per thread, like secret keys: a subject's misses are all decided on its owner thread.
	const subjectPulls = createSubjectPulls({
		ctx: {
			autumnClient: getAutumnClient({ env }),
			counters,
			logger,
		},
	});
	const { auth, multiTenant, held } = openAuth({ env, owners, subjectPulls });
	const answerPorts = new Map<number, MessagePort>();
	let stopping = false;
	// Only an org's own Atom has replicas to keep in step; a multi-tenant one holds every folder itself.
	const replicas =
		env.ATOM_MODE === "deployed"
			? openReplicas({
					env,
					slots: auth.slotsFor({ atomId: null }),
					counters,
					logger,
					isStopping: () => stopping,
				})
			: undefined;
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
			replication: replicas?.replication,
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
		if (!replicas) return;
		await replicas.sync.catchUp();
		void replicas.sync.runPasses();
	}

	/** Pulls stop first, so none lands in a folder as it closes. */
	async function stop(): Promise<void> {
		stopping = true;
		subjectPulls.stop();
		await server.stop();
	}

	return { start, stop, join, leave };
};

/** The pushes this thread applies, on their way to every other replica, and what this one copies back from them. */
const openReplicas = ({
	env,
	slots,
	counters,
	logger,
	isStopping,
}: {
	env: Extract<ThreadInit["env"], { ATOM_MODE: "deployed" }>;
	slots: Slots | null;
	counters: ReturnType<typeof openThreadCounters>;
	logger: ReturnType<typeof getAtomLogger>;
	isStopping: () => boolean;
}) => {
	if (!slots)
		throw new Error("An org's own Atom opens its one folder on every thread");
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(CATALOG_PUSH);
	const replication = createReplication({
		ctx: {
			secret: env.ATOM_PEER_SECRET,
			port: env.ATOM_PEER_PORT,
			registry,
			counters,
			logger,
		},
	});
	// Built before the thread listens: the point it fell behind at must not move once live relays land.
	const sync = createReplicaSync({
		ctx: {
			replication,
			port: env.ATOM_PEER_PORT,
			secret: env.ATOM_PEER_SECRET,
			logger,
			now: Date.now,
			isStopping,
		},
		slots,
	});
	return { replication, sync };
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
