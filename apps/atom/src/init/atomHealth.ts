import {
	readThreadStats,
	type ThreadStats,
} from "../threads/stats/threadStats.js";
import { type ContainerStats, readContainerStats } from "./containerStats.js";

export type AtomHealth = {
	/** "starting" until every thread serves and the replica has caught up; the load balancer keeps it out until then. */
	status: "alive" | "starting";
	bootedAt: string;
	restarts: number;
	container: ContainerStats;
	threads: ThreadStats[];
};

/** What every thread's /health reports: the main thread's boot, how many threads it has replaced since, and every thread's counters. */
export type AtomHealthSource = {
	bootedAt: string;
	/** Two Int32s the main thread writes: [0] threads replaced since boot, [1] 1 once the replica is ready to serve. */
	restarts: Int32Array;
	threadStats: SharedArrayBuffer;
};

/** Index of the ready flag in the shared Int32 array beside the restart count. */
export const READY_FLAG = 1;

export const readAtomHealth = ({
	bootedAt,
	restarts,
	threadStats,
}: AtomHealthSource): AtomHealth => ({
	status: Atomics.load(restarts, READY_FLAG) === 1 ? "alive" : "starting",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	threads: readThreadStats({ buffer: threadStats }),
});
