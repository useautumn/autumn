import type { AutumnLogger } from "@autumn/logging";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type DiskEvictorContext = {
	folders: Pick<ReplicaFolders, "all">;
	counters: Pick<ThreadCounters, "add" | "set">;
	logger: Pick<AutumnLogger, "warn">;
	now?: () => number;
	sleep?: (ms: number) => Promise<unknown>;
};

export type DiskEvictor = {
	tick(): Promise<void>;
	run(): Promise<void>;
	stop(): void;
};
