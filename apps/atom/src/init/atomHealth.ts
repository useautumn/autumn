import { readVolumeBytes } from "../disk/readVolumeBytes.js";
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
	/** The volume the data folder is on: what the disk share is a part of, and how much of it is still free. */
	disk: { totalBytes: number; availBytes: number };
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
	dataDir: string;
};

export const isAtomReady = ({
	ready,
}: Pick<AtomHealthSource, "ready">): boolean => Atomics.load(ready, 0) === 1;

export const readAtomHealth = ({
	bootedAt,
	restarts,
	ready,
	threadStats,
	dataDir,
}: AtomHealthSource): AtomHealth => ({
	status: isAtomReady({ ready }) ? "alive" : "starting",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	disk: readVolumeBytes({ path: dataDir }),
	threads: readThreadStats({ buffer: threadStats }),
});
