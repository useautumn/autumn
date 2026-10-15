import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timeout } from "@tests/utils/genUtils.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	atomTokenToHash,
	generateAtomToken,
} from "@/internal/byoc/utils/atomTokenUtils.js";
import { createReplicaRing } from "../../../../../../apps/atom/src/replicas/createReplicaRing.js";
import { createReplicaBalancer } from "./createReplicaBalancer.js";
import { type AutumnGate, createAutumnGate } from "./gates/createAutumnGate.js";
import { cutKey, PEER_VIEW_REREAD_MS, writePeerViews } from "./peerViews.js";
import {
	registerReplicaSet,
	unregisterReplicaSet,
} from "./registerReplicaSet.js";
import {
	replicaHealth,
	replicaUrl,
	signalReplica,
	spawnReplica,
	waitUntilReplicaReady,
} from "./replicaProcesses.js";
import type {
	Replica,
	ReplicaSet,
	ReplicaSetContext,
} from "./types/replicaSet.js";

type Balancer = ReturnType<typeof createReplicaBalancer>;

const replicaAt = ({
	ctx,
	index,
}: {
	ctx: ReplicaSetContext;
	index: number;
}): Replica => {
	const replica = ctx.replicas[index];
	if (!replica) throw new Error(`The set has no replica ${index}`);
	return replica;
};

const newReplica = ({
	ctx,
	index,
}: {
	ctx: ReplicaSetContext;
	index: number;
}): Replica => {
	const dir = join(ctx.dir, `replica-${index}`);
	mkdirSync(dir, { recursive: true });
	return {
		index,
		hostname: `127.0.${ctx.subnet}.${10 + index}`,
		dataDir: join(dir, "data"),
		peersFile: join(dir, "peers"),
		logFile: join(dir, "atom.log"),
		process: null,
		stopping: false,
	};
};

/** Listed for its peers from the moment it starts, as the service name lists a starting container. */
const startReplica = async ({
	ctx,
	index,
}: {
	ctx: ReplicaSetContext;
	index: number;
}): Promise<void> => {
	const replica = replicaAt({ ctx, index });
	if (replica.process) throw new Error(`Replica ${index} is already running`);
	mkdirSync(replica.dataDir, { recursive: true });
	spawnReplica({ ctx, replica });
	writePeerViews({ ctx });
	await waitUntilReplicaReady({ replica });
};

/** Gone from its peers' view as its process is signalled, as the service name drops a stopping container. */
const stopReplica = async ({
	ctx,
	index,
	signal,
}: {
	ctx: ReplicaSetContext;
	index: number;
	signal: "SIGTERM" | "SIGKILL";
}): Promise<void> => {
	const replica = replicaAt({ ctx, index });
	// Marks the replica stopping before its first await, so the views written next already leave it out.
	const stopping = signalReplica({ replica, signal });
	writePeerViews({ ctx });
	await stopping;
};

const restartReplica = async ({
	ctx,
	index,
}: {
	ctx: ReplicaSetContext;
	index: number;
}): Promise<void> => {
	await stopReplica({ ctx, index, signal: "SIGTERM" });
	await startReplica({ ctx, index });
};

const restartAll = async ({ ctx }: { ctx: ReplicaSetContext }) => {
	const indexes = ctx.replicas.map((replica) => replica.index);
	await Promise.all(
		indexes.map((index) => stopReplica({ ctx, index, signal: "SIGTERM" })),
	);
	await Promise.all(indexes.map((index) => startReplica({ ctx, index })));
};

const wipeVolume = ({
	ctx,
	index,
}: {
	ctx: ReplicaSetContext;
	index: number;
}): Promise<void> => {
	const replica = replicaAt({ ctx, index });
	if (replica.process)
		throw new Error(`Stop replica ${index} before wiping its volume`);
	rmSync(replica.dataDir, { recursive: true, force: true });
	return Promise.resolve();
};

const scaleTo = async ({
	ctx,
	size,
}: {
	ctx: ReplicaSetContext;
	size: number;
}): Promise<void> => {
	while (ctx.replicas.length > size) {
		const index = ctx.replicas.length - 1;
		await stopReplica({ ctx, index, signal: "SIGTERM" });
		ctx.replicas.pop();
		writePeerViews({ ctx });
	}
	const added: number[] = [];
	for (let index = ctx.replicas.length; index < size; index++) {
		ctx.replicas.push(newReplica({ ctx, index }));
		added.push(index);
	}
	await Promise.all(added.map((index) => startReplica({ ctx, index })));
};

/** Resolves once both replicas have re-read their peers, so neither relays to nor asks the other any more. */
const cutPeer = async ({
	ctx,
	left,
	right,
}: {
	ctx: ReplicaSetContext;
	left: number;
	right: number;
}): Promise<void> => {
	ctx.cuts.add(cutKey({ left, right }));
	writePeerViews({ ctx });
	await timeout(PEER_VIEW_REREAD_MS);
};

const healPeers = async ({ ctx }: { ctx: ReplicaSetContext }) => {
	if (ctx.cuts.size === 0) return;
	ctx.cuts.clear();
	writePeerViews({ ctx });
	await timeout(PEER_VIEW_REREAD_MS);
};

/** Back to `size` running replicas, every link healed and the balancer spreading requests. */
const restore = async ({
	ctx,
	balancer,
	autumnGate,
	size,
}: {
	ctx: ReplicaSetContext;
	balancer: Balancer;
	autumnGate: AutumnGate;
	size: number;
}): Promise<void> => {
	balancer.routeTo(null);
	await Promise.all([balancer.pushGate.open(), autumnGate.handIns.open()]);
	await healPeers({ ctx });
	await scaleTo({ ctx, size });
	const stopped = ctx.replicas.filter((replica) => replica.process === null);
	await Promise.all(
		stopped.map((replica) => startReplica({ ctx, index: replica.index })),
	);
};

const close = async ({
	ctx,
	balancer,
	autumnGate,
}: {
	ctx: ReplicaSetContext;
	balancer: Balancer;
	autumnGate: AutumnGate;
}): Promise<void> => {
	await unregisterReplicaSet();
	autumnGate.stop();
	await Promise.all(
		ctx.replicas.map((replica) =>
			signalReplica({ replica, signal: "SIGKILL" }),
		),
	);
	await balancer.stop();
};

const ownerIndexOf = async ({
	ctx,
	customerId,
}: {
	ctx: ReplicaSetContext;
	customerId: string;
}): Promise<number> => {
	const hostnames = ctx.replicas.map(({ hostname }) => hostname);
	const ring = createReplicaRing({
		ctx: {
			resolver: { peers: async () => hostnames },
			own: () => hostnames.slice(0, 1),
		},
	});
	return hostnames.indexOf(await ring.ownerOf({ customerId }));
};

/**
 * Starts `size` replicas of the org's own Atom on this machine and registers them, behind one balancer, as the org's Atom.
 * Each replica listens on its own loopback address with its own volume; the set's files are kept under `dir` for reading after a run.
 */
export const createReplicaSet = async ({
	autumn,
	size,
}: {
	autumn: AutumnInt;
	size: number;
}): Promise<ReplicaSet> => {
	const token = generateAtomToken();
	const autumnGate = createAutumnGate({
		autumnApiUrl: autumn.baseUrl.replace(/\/v1$/, ""),
	});
	const ctx: ReplicaSetContext = {
		dir: mkdtempSync(join(tmpdir(), "atom-replica-set-")),
		subnet: 1 + Math.floor(Math.random() * 250),
		tokenHash: atomTokenToHash({ token }),
		peerSecret: randomBytes(32).toString("hex"),
		autumnApiUrl: autumnGate.url,
		replicas: [],
		cuts: new Set(),
	};
	const balancer = createReplicaBalancer({ ctx });
	try {
		await registerReplicaSet({ autumn, endpointUrl: balancer.url, token });
		await scaleTo({ ctx, size });
	} catch (error) {
		await close({ ctx, balancer, autumnGate });
		throw error;
	}

	return {
		endpointUrl: balancer.url,
		token,
		replica: (index) => ({
			endpointUrl: replicaUrl({ replica: replicaAt({ ctx, index }) }),
			token,
		}),
		size: () => ctx.replicas.length,
		start: (index) => startReplica({ ctx, index }),
		stop: (index) => stopReplica({ ctx, index, signal: "SIGTERM" }),
		kill: (index) => stopReplica({ ctx, index, signal: "SIGKILL" }),
		restart: (index) => restartReplica({ ctx, index }),
		restartAll: () => restartAll({ ctx }),
		wipeVolume: (index) => wipeVolume({ ctx, index }),
		scaleTo: (size) => scaleTo({ ctx, size }),
		cutPeer: (left, right) => cutPeer({ ctx, left, right }),
		healPeers: () => healPeers({ ctx }),
		ownerIndexOf: ({ customerId }) => ownerIndexOf({ ctx, customerId }),
		routeTo: balancer.routeTo,
		pushes: balancer.pushes,
		holdHandIns: autumnGate.handIns.shut,
		releaseHandIns: autumnGate.handIns.open,
		heldHandIns: autumnGate.handIns.heldCount,
		holdPushes: balancer.pushGate.shut,
		releasePushes: balancer.pushGate.open,
		restore: (size) => restore({ ctx, balancer, autumnGate, size }),
		health: (index) => replicaHealth({ replica: replicaAt({ ctx, index }) }),
		close: () => close({ ctx, balancer, autumnGate }),
	};
};
