import {
	readThreadStats,
	type ThreadStats,
} from "../threads/stats/threadStats.js";
import { type ContainerStats, readContainerStats } from "./containerStats.js";

export type AtomHealth = {
	status: "alive";
	bootedAt: string;
	restarts: number;
	container: ContainerStats;
	threads: ThreadStats[];
};

/** What every thread's /health reports: the main thread's boot, how many threads it has replaced since, and every thread's counters. */
export type AtomHealthSource = {
	bootedAt: string;
	/** One Int32 the main thread counts in. */
	restarts: Int32Array;
	threadStats: SharedArrayBuffer;
};

export const readAtomHealth = ({
	bootedAt,
	restarts,
	threadStats,
}: AtomHealthSource): AtomHealth => ({
	status: "alive",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	threads: readThreadStats({ buffer: threadStats }),
});
