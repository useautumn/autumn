import type { Subprocess } from "bun";
import type { TestAtom } from "../../ensureAtomDeployment.js";

/** One Atom process of the set: its own loopback address, volume, peers file and log. */
export type Replica = {
	index: number;
	hostname: string;
	dataDir: string;
	peersFile: string;
	logFile: string;
	/** Set until the process exits, so the balancer keeps routing to a replica that is draining. */
	process: Subprocess | null;
	/** Signalled: gone from its peers' view, still serving until its listener closes. */
	stopping: boolean;
};

/** What /health says: nothing listening, listening but not caught up, or serving. */
export type ReplicaHealth = "down" | "starting" | "ready";

/** A push as the balancer passed it on: which replica took it, and what it answered. */
export type PushLanding = {
	path: string;
	customerId: string | null;
	/** The entity a subject push is for, read from its body; null for the customer's own copy or a catalog push. */
	entityId: string | null;
	replica: number;
	status: number;
	at: number;
};

/** What every replica of one set shares, and what the set's actions move. */
export type ReplicaSetContext = {
	dir: string;
	subnet: number;
	tokenHash: string;
	peerSecret: string;
	autumnApiUrl: string;
	replicas: Replica[];
	/** Pairs of replicas that cannot see each other, as `low:high`. */
	cuts: Set<string>;
};

/** N real Atom processes behind one local balancer, registered as the org's Atom; every action resolves once it holds. */
export type ReplicaSet = TestAtom & {
	/** One replica answering on its own address, past the balancer. */
	replica(index: number): TestAtom;
	size(): number;
	/** Starts a stopped replica on its kept volume; resolves once its /health says ready. */
	start(index: number): Promise<void>;
	/** SIGTERM, as a rolling release stops a replica. */
	stop(index: number): Promise<void>;
	/** SIGKILL: nothing in memory reaches the peers or the volume. */
	kill(index: number): Promise<void>;
	/** stop, then start on the kept volume. */
	restart(index: number): Promise<void>;
	/** Every replica stopped at once, then every replica started at once. */
	restartAll(): Promise<void>;
	/** Empties a stopped replica's volume, as a replaced machine starts with none. */
	wipeVolume(index: number): Promise<void>;
	/** Adds replicas with fresh volumes, or stops the highest-indexed ones. */
	scaleTo(size: number): Promise<void>;
	/** The two replicas stop seeing each other, as a split network shows them; each still serves. */
	cutPeer(left: number, right: number): Promise<void>;
	healPeers(): Promise<void>;
	/** The replica the Atom's own ring gives the customer to, among every replica of the set. */
	ownerIndexOf(params: { customerId: string }): Promise<number>;
	/** Every request the balancer gets goes to this replica; null spreads them over the running ones. */
	routeTo(index: number | null): void;
	pushes(): PushLanding[];
	/** The replicas' hand-ins wait, each replica still waiting for Autumn's reply, until released. */
	holdHandIns(): void;
	/** The held hand-ins reach Autumn one at a time, in the order they were sent. */
	releaseHandIns(): Promise<void>;
	heldHandIns(): number;
	/** Herald's pushes are taken but reach no replica until released, as a slow link delays them. */
	holdPushes(): void;
	/** Only the subject pushes for one copy (an entity's, or the customer's own with null) are held; the rest reach the replicas. */
	holdSubjectPushes(params: {
		customerId: string;
		entityId: string | null;
	}): void;
	/** The held pushes reach the replicas one at a time, in the order herald sent them. */
	releasePushes(): Promise<void>;
	/** Back to `size` running replicas, every link healed and the balancer spreading requests. */
	restore(size: number): Promise<void>;
	health(index: number): Promise<ReplicaHealth>;
	close(): Promise<void>;
};
