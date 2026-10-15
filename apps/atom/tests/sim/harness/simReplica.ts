import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import {
	createDeployedAuth,
	type DeployedAuth,
} from "../../../src/auth/createDeployedAuth.js";
import {
	createDiskEvictor,
	DISK_SHARE,
} from "../../../src/disk/createDiskEvictor.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { createPeerApp } from "../../../src/http/createPeerApp.js";
import type { AtomHttpEnv } from "../../../src/http/types/atomHttp.js";
import {
	CATALOG_PUSH,
	DELETE_PUSH,
	SUBJECT_PUSH,
} from "../../../src/pushes/applyPushes.js";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { createReplicaSync } from "../../../src/replication/createReplicaSync.js";
import { createReplication } from "../../../src/replication/createReplication.js";
import { createPeerResolver } from "../../../src/replication/discovery/createPeerResolver.js";
import { createDeployedFolders } from "../../../src/replication/folders/createReplicaFolders.js";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import type { Replication } from "../../../src/replication/types/replication.js";
import {
	createHeldSubjects,
	HELD_IDLE_EXPIRY_MS,
} from "../../../src/state/heldSubjects/createHeldSubjects.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	forwardingNowhere,
	noSubjectPulls,
} from "../../unit/utils/atomFixtures.js";
import type { Endpoint, SimNetwork } from "./simNetwork.js";
import type { VirtualClock } from "./virtualClock.js";

export const SIM_PORT = 8080;
export const SIM_PEER_PORT = 8081;
export const SIM_SLOT_COUNT = 2;
const AUTUMN_API_URL = "https://api.autumn.example";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

/** Volumes live where opening a SQLite file is cheapest; a seed opens dozens. */
const VOLUME_ROOT = process.env.ATOM_SIM_VOLUMES ?? "/dev/shm";

export type Volume = { folder: string };

export const createVolume = (): Volume => ({
	folder: mkdtempSync(join(VOLUME_ROOT, "atom-sim-")),
});
export const destroyVolume = (volume: Volume) =>
	rmSync(volume.folder, { recursive: true, force: true });

let generation = 0;

/** A volume whose 80% share is `shareBytes`, `used` bytes of it taken by the files. */
export const simVolumeOf = ({
	shareBytes,
	used,
}: {
	shareBytes: number | undefined;
	used: number;
}) => {
	const totalBytes =
		shareBytes === undefined
			? Number.MAX_SAFE_INTEGER
			: shareBytes / DISK_SHARE;
	return { totalBytes, availBytes: Math.max(0, totalBytes - used) };
};

export type SimReplicaContext = {
	clock: VirtualClock;
	network: SimNetwork;
	tokenHash: string;
	secret: string;
	address: string;
	volume: Volume;
	/** This replica's clock runs this far ahead of the simulation's. */
	skewMs?: number;
	/** What the replica may hold parsed, and what its files may take of the volume; unbounded unless the scenario says. */
	heldBudgetBytes?: number;
	diskShareBytes?: number;
	log?: (line: string) => void;
};

export type ReplicaState =
	| "created"
	| "starting"
	| "ready"
	| "stopping"
	| "stopped"
	| "killed";

/** One replica as one process: the real apps, slots and replication layer over the simulated network and clock, booted as a thread boots. */
export const createSimReplica = ({ ctx }: { ctx: SimReplicaContext }) => {
	const { clock, network } = ctx;
	const id = ++generation;
	const now = () => clock.now() + (ctx.skewMs ?? 0);
	let state: ReplicaState = "created";
	const alive = () => state !== "killed" && state !== "stopped";

	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const held = createHeldSubjects({
		budgetBytes: ctx.heldBudgetBytes ?? 64 * 1024 * 1024,
		idleExpiryMs: HELD_IDLE_EXPIRY_MS,
		now,
	});
	const auth: DeployedAuth = createDeployedAuth({
		journalForwarder: forwardingNowhere,
		dataDir: ctx.volume.folder,
		tokenHash: ctx.tokenHash,
		slotCount: SIM_SLOT_COUNT,
		owners: allSlotsOwnedHere,
		held,
		now,
		subjectPulls: noSubjectPulls,
	});
	const folders = createDeployedFolders({ slots: auth.slots });
	/** What the replica's files hold now. */
	const diskBytes = () =>
		auth.slots.ownedStores().reduce((sum, store) => sum + store.dataBytes(), 0);
	// The sim has no volume of its own: what the files hold stands in for what the volume sees.
	const diskEvictor = createDiskEvictor({
		ctx: { folders, counters, logger: quiet, now, sleep: clock.sleep },
		volumeOf: () =>
			simVolumeOf({ shareBytes: ctx.diskShareBytes, used: diskBytes() }),
		threads: 1,
	});
	const endpoint: Endpoint = {
		id,
		address: ctx.address,
		alive,
		ready: () => state === "ready",
		request: async ({ port, path, init }) =>
			(port === SIM_PEER_PORT ? peerApp : app).request(path, init),
	};
	const fetch = network.fetchFor(endpoint);
	const registry = createHandlerRegistry();
	registry.register(SUBJECT_PUSH);
	registry.register(DELETE_PUSH);
	registry.register(CATALOG_PUSH);
	const replication: Replication = createReplication({
		ctx: {
			secret: ctx.secret,
			port: SIM_PEER_PORT,
			registry,
			counters,
			logger: quiet,
			resolver: createPeerResolver({
				ctx: {
					resolve: () => network.resolve(),
					own: () => [ctx.address],
					now,
				},
			}),
			now,
			sleep: clock.sleep,
			fetch,
		},
	});
	const ready = new Int32Array(new SharedArrayBuffer(4));
	const httpContext = {
		auth,
		logger: quiet,
		autumnApiUrl: AUTUMN_API_URL,
		health: {
			bootedAt: new Date(clock.now()).toISOString(),
			restarts: new Int32Array(1),
			ready,
			threadsReady: new Int32Array([1]),
			thread: 0,
			threadStats,
			dataDir: ctx.volume.folder,
		},
		counters,
		// The sim runs on a virtual clock; a busy test process must never read as a loop behind.
		loop: { lagMs: () => 0 },
		replication,
		peer: {
			port: SIM_PEER_PORT,
			secret: ctx.secret,
			ring: createReplicaRing({
				ctx: { resolver: replication, own: () => [ctx.address] },
			}),
			fetch,
		},
		now,
	};
	const app: Hono<AtomHttpEnv> = createAtomApp({ ctx: httpContext });
	const peerApp: Hono<AtomHttpEnv> = createPeerApp({
		ctx: httpContext,
		secret: ctx.secret,
	});
	// Built before listening, as the thread does: the point this replica fell behind at is fixed here.
	const sync = createReplicaSync({
		ctx: {
			replication,
			port: SIM_PEER_PORT,
			secret: ctx.secret,
			logger: quiet,
			sleep: clock.sleep,
			fetch,
			now,
			isStopping: () => state !== "ready",
		},
		folders,
	});

	/** As the thread boots: listens, catches up, reports ready, then keeps passing and keeps its files within their share. */
	async function start(): Promise<void> {
		state = "starting";
		network.bind(endpoint);
		await sync.catchUp();
		if (state !== "starting") return;
		Atomics.store(ready, 0, 1);
		state = "ready";
		ctx.log?.(`${ctx.address}#${id} ready`);
		void sync.runPasses();
		void diskEvictor.run();
	}

	/** As the process stops: the listener closes, the outbox flushes, the files close. */
	async function stop(): Promise<void> {
		if (!alive()) return;
		state = "stopping";
		network.unbind(endpoint);
		diskEvictor.stop();
		await replication.stop();
		state = "stopped";
		auth.close();
		ctx.log?.(`${ctx.address}#${id} stopped`);
	}

	/** The process is gone at once: nothing in flight finishes, nothing is flushed. */
	function kill(): void {
		if (!alive()) return;
		network.unbind(endpoint);
		diskEvictor.stop();
		state = "killed";
		auth.close();
		ctx.log?.(`${ctx.address}#${id} killed`);
	}

	return {
		id,
		address: ctx.address,
		app,
		peerApp,
		slots: auth.slots,
		held,
		diskBytes,
		state: () => state,
		alive,
		isReady: () => state === "ready",
		stats: () => readThreadStats({ buffer: threadStats })[0],
		start,
		stop,
		kill,
	};
};

export type SimReplica = ReturnType<typeof createSimReplica>;
