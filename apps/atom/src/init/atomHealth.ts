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
	/** One Int32 the main thread counts in. */
	restarts: Int32Array;
	/** One Int32 the main thread sets to 1 once every thread serves and has caught up; absent on a one-thread Atom. */
	ready?: Int32Array;
	threadStats: SharedArrayBuffer;
};

export const readAtomHealth = ({
	bootedAt,
	restarts,
	ready,
	threadStats,
}: AtomHealthSource): AtomHealth => ({
	status: !ready || Atomics.load(ready, 0) === 1 ? "alive" : "starting",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	threads: readThreadStats({ buffer: threadStats }),
});
