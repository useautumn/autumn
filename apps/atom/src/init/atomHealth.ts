import {
	readThreadStats,
	type ThreadStats,
} from "../threads/stats/threadStats.js";
import { type ContainerStats, readContainerStats } from "./containerStats.js";

export type AtomHealth = {
	/** Starting until every thread listens and has copied from its peers what it missed. */
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
	/** One Int32 the main thread sets to 1 once the Atom may serve. */
	ready: Int32Array;
	threadStats: SharedArrayBuffer;
};

export const isAtomReady = ({
	ready,
}: Pick<AtomHealthSource, "ready">): boolean => Atomics.load(ready, 0) === 1;

export const readAtomHealth = ({
	bootedAt,
	restarts,
	ready,
	threadStats,
}: AtomHealthSource): AtomHealth => ({
	status: isAtomReady({ ready }) ? "alive" : "starting",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	threads: readThreadStats({ buffer: threadStats }),
});
