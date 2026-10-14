import type { Subprocess } from "bun";
import type { TestAtom } from "../../ensureAtomDeployment.js";

export type Replica = {
	index: number;
	hostname: string;
	dataDir: string;
	peersFile: string;
	logFile: string;
	process: Subprocess | null;
	stopping: boolean;
};

export type ReplicaHealth = "down" | "starting" | "ready";

export type PushLanding = {
	path: string;
	customerId: string | null;
	replica: number;
	status: number;
	at: number;
};

export type ReplicaSetContext = {
	dir: string;
	subnet: number;
	tokenHash: string;
	peerSecret: string;
	autumnApiUrl: string;
	replicas: Replica[];
	cuts: Set<string>;
};

export type ReplicaSet = TestAtom & {
	replica(index: number): TestAtom;
	size(): number;
	start(index: number): Promise<void>;
	stop(index: number): Promise<void>;
	kill(index: number): Promise<void>;
	restart(index: number): Promise<void>;
	restartAll(): Promise<void>;
	wipeVolume(index: number): Promise<void>;
	scaleTo(size: number): Promise<void>;
	cutPeer(left: number, right: number): Promise<void>;
	healPeers(): Promise<void>;
	routeTo(index: number | null): void;
	pushes(): PushLanding[];
	restore(size: number): Promise<void>;
	health(index: number): Promise<ReplicaHealth>;
	close(): Promise<void>;
};
