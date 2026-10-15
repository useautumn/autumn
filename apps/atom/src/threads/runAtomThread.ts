import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import type { Auth } from "../auth/types/auth.js";
import { getAutumnClient } from "../autumnClient/getAutumnClient.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { createJournalForwarder } from "../journalForwarder/createJournalForwarder.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { ATOM_DELETE, ATOM_PUT } from "../multiTenant/replicateAtoms.js";
import {
	CATALOG_PUSH,
	DELETE_PUSH,
	SUBJECT_PUSH,
} from "../pushes/applyPushes.js";
import { createReplicaRing } from "../replicas/createReplicaRing.js";
import { createHandoffBarrier } from "../replicas/handover/createHandoffBarrier.js";
import { createMembership } from "../replicas/membership/createMembership.js";
import { createReplicaSync } from "../replication/createReplicaSync.js";
import { createReplication } from "../replication/createReplication.js";
import {
	createPeerResolver,
	ownAddresses,
	type PeerResolver,
} from "../replication/discovery/createPeerResolver.js";
import {
	createDeployedFolders,
	createMultiTenantFolders,
} from "../replication/folders/createReplicaFolders.js";
import { createHandlerRegistry } from "../replication/handlers/createHandlerRegistry.js";
import type { ReplicaFolders } from "../replication/types/replicaFolders.js";
import type { Slots } from "../slots/types/slots.js";
import { shareSqliteOpenLock } from "../state/newSqliteConnection.js";
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
	// Per thread too: a journal belongs to its slot's owner thread.
	const journalForwarder = createJournalForwarder({
		ctx: { autumnClient: getAutumnClient({ env }), logger, counters },
	});
	// A replica set on one machine is reached at its loopback hostname, not the machine's own address.
	const self =
		(env.ATOM_PEERS_FILE ? env.ATOM_HOSTNAME : ownAddresses()[0]) ??
		env.ATOM_HOSTNAME;
	const membership = createMembership({
		self,
		table: new Int32Array(init.membership),
	});
	const resolver = createPeerResolver({
		ctx: { peersFile: env.ATOM_PEERS_FILE },
	});
	const ring = createReplicaRing({
		ctx: { resolver, own: () => [self], membership },
	});
	// On this thread, where a moved customer's handoff and its requests both land.
	const barrier = createHandoffBarrier({ ctx: { membership, counters } });
	const { auth, multiTenant, held } = openAuth({
		env,
		owners,
		subjectPulls,
		journalForwarder,
		barrier,
		ring,
	});
	const health = {
		bootedAt: init.bootedAt,
		restarts: new Int32Array(init.restarts),
		ready: new Int32Array(init.ready),
		threadsReady: new Int32Array(init.threadsReady),
		threadStats: init.stats,
		dataDir: env.ATOM_DATA_DIR,
		thread: index,
	};
	const answerPorts = new Map<number, MessagePort>();
	let stopping = false;
	const folders = multiTenant
		? createMultiTenantFolders({ auth: multiTenant.auth })
		: createDeployedFolders({ slots: ownFolder({ auth }) });
	// Every Atom keeps its replicas in step: an org's own over its one folder, a multi-tenant one over every tenant's.
	const replicas = openReplicas({
		env,
		resolver,
		folders,
		counters,
		logger,
		isStopping: () => stopping,
	});
	const server = createAtomServer({
		ctx: {
			auth,
			multiTenant,
			logger,
			health,
			counters,
			held,
			folders,
			replication: replicas.replication,
			journalForwarder,
			membership,
			ring,
		},
		config: {
			env,
			// The highest-indexed threads receive: slots go round-robin from 0, so the lowest own one more.
			receivesPushes: index >= env.ATOM_THREADS - env.ATOM_PUSH_RECEIVERS,
		},
	});

	function join({ peer, ports }: { peer: number; ports: PeerPorts }): void {
		owners.connect({ thread: peer, port: ports.calls });
		answerOwnerCalls({ ctx: { auth, health }, port: ports.answers });
		answerPorts.set(peer, ports.answers);
	}

	function leave({ peer }: { peer: number }): void {
		owners.disconnect({ thread: peer });
		answerPorts.get(peer)?.close();
		answerPorts.delete(peer);
	}

	/** Listens first, so peers can relay to it, then copies what it missed before it answers from its own files. */
	async function start(): Promise<void> {
		await server.start();
		await replicas.sync.catchUp();
		await server.probePeers?.();
		Atomics.store(health.threadsReady, index, 1);
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

/** An org's own Atom opens its one folder on every thread. */
const ownFolder = ({ auth }: { auth: Auth }): Slots => {
	const slots = auth.slotsFor({ atomId: null });
	if (!slots)
		throw new Error("An org's own Atom opens its one folder on every thread");
	return slots;
};

/** The pushes and tenants this thread applies, on their way to every other replica, and what this one copies back from them. */
const openReplicas = ({
	env,
	resolver,
	folders,
	counters,
	logger,
	isStopping,
}: {
	env: ThreadInit["env"];
	resolver: PeerResolver;
	folders: ReplicaFolders;
	counters: ReturnType<typeof openThreadCounters>;
	logger: ReturnType<typeof getAtomLogger>;
	isStopping: () => boolean;
}) => {
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(DELETE_PUSH);
	registry.register(CATALOG_PUSH);
	registry.register(ATOM_PUT);
	registry.register(ATOM_DELETE);
	const replication = createReplication({
		ctx: {
			secret: env.ATOM_PEER_SECRET,
			port: env.ATOM_PEER_PORT,
			resolver,
			registry,
			counters,
			logger,
		},
	});
	// Built before the thread listens: the point each folder fell behind at must not move once live relays land.
	const sync = createReplicaSync({
		ctx: {
			replication,
			port: env.ATOM_PEER_PORT,
			secret: env.ATOM_PEER_SECRET,
			logger,
			now: Date.now,
			isStopping,
		},
		folders,
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
			shareSqliteOpenLock({ lock: control.sqliteOpenLock });
			thread = openThread({ init: control });
			// Before it listens: a check it takes must reach its owner thread, not find no line to it yet.
			for (const { index, ports } of control.peers)
				thread.join({ peer: index, ports });
			await thread.start();
			report({ type: "ready" });
		} else if (control.type === "peerJoined")
			thread?.join({ peer: control.index, ports: control.ports });
		else if (control.type === "peerLeft")
			thread?.leave({ peer: control.index });
		else {
			await thread?.stop();
			// The main thread terminates this worker on "stopped": what the stop logged must be out first.
			await getAtomLogger().flush?.();
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
