import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import type { Auth } from "../auth/types/auth.js";
import { getAutumnClient } from "../autumnClient/getAutumnClient.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { ATOM_DELETE, ATOM_PUT } from "../multiTenant/replicateAtoms.js";
import {
	CATALOG_PUSH,
	DELETE_PUSH,
	SUBJECT_PUSH,
} from "../pushes/applyPushes.js";
import { createReplicaSync } from "../replication/createReplicaSync.js";
import { createReplication } from "../replication/createReplication.js";
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

const openThread = ({ init }: { init: ThreadInit }) => {
	const { env, index } = init;
	const logger = getAtomLogger();
	const owners = createSlotOwners({ index, threads: env.ATOM_THREADS });
	const counters = openThreadCounters({ buffer: init.stats, index });
	const subjectPulls = createSubjectPulls({
		ctx: {
			autumnClient: getAutumnClient({ env }),
			counters,
			logger,
		},
	});
	const { auth, multiTenant, held } = openAuth({ env, owners, subjectPulls });
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
	const replicas = openReplicas({
		env,
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
		},
		config: {
			env,
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

	async function start(): Promise<void> {
		await server.start();
		await replicas.sync.catchUp();
		Atomics.store(health.threadsReady, index, 1);
		void replicas.sync.runPasses();
	}

	async function stop(): Promise<void> {
		stopping = true;
		subjectPulls.stop();
		await server.stop();
	}

	return { start, stop, join, leave };
};

const ownFolder = ({ auth }: { auth: Auth }): Slots => {
	const slots = auth.slotsFor({ atomId: null });
	if (!slots)
		throw new Error("An org's own Atom opens its one folder on every thread");
	return slots;
};

const openReplicas = ({
	env,
	folders,
	counters,
	logger,
	isStopping,
}: {
	env: ThreadInit["env"];
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
			peersFile: env.ATOM_PEERS_FILE,
			registry,
			counters,
			logger,
		},
	});
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

export const runAtomThread = (): void => {
	const main = parentPort;
	if (!main) throw new Error("runAtomThread runs in a worker thread");
	const report = (status: ThreadStatus) => main.postMessage(status);
	let thread: ReturnType<typeof openThread> | undefined;

	async function receive(control: ThreadControl): Promise<void> {
		if (control.type === "init") {
			shareSqliteOpenLock({ lock: control.sqliteOpenLock });
			thread = openThread({ init: control });
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
			report({ type: "stopped" });
		}
	}

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
