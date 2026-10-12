import type { AutumnLogger } from "@autumn/logging";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type DiskEvictorContext = {
	/** Every folder this thread holds; the evictor touches only the slot files it owns in each. */
	folders: Pick<ReplicaFolders, "all">;
	counters: Pick<ThreadCounters, "add" | "set">;
	logger: Pick<AutumnLogger, "warn">;
	now?: () => number;
	sleep?: (ms: number) => Promise<unknown>;
};

/** Keeps one thread's slot files within its share of the volume, and rid of customers Autumn stopped pushing. */
export type DiskEvictor = {
	/** One pass over the files: reads the share, measures them, then drops one batch per file of what is idle or, over the share, oldest. */
	tick(): Promise<void>;
	/** Ticks every period until stopped. */
	run(): Promise<void>;
	stop(): void;
};
