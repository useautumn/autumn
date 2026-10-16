import { readVolumeBytes } from "../disk/readVolumeBytes.js";
import {
	readThreadStats,
	type ThreadStats,
} from "../threads/stats/threadStats.js";
import { type ContainerStats, readContainerStats } from "./containerStats.js";

export type AtomHealth = {
	/** Starting until every thread has caught up once; degraded while one that died is replaced, the others still answering. */
	status: "alive" | "degraded" | "starting";
	bootedAt: string;
	restarts: number;
	container: ContainerStats;
	/** The volume the data folder is on: what the disk share is a part of, and how much of it is still free. */
	disk: { totalBytes: number; availBytes: number };
	threads: (ThreadStats & { ready: boolean })[];
};

/** What every thread's /health reports: the main thread's boot, how many threads it has replaced since, and every thread's counters. */
export type AtomHealthSource = {
	bootedAt: string;
	/** One Int32 the main thread counts in. */
	restarts: Int32Array;
	/** One Int32 the main thread sets to the second every thread had started; 0 until then, kept once set. */
	ready: Int32Array;
	/** One Int32 per thread: 1 once that thread has caught up, back to 0 when it dies. */
	threadsReady: Int32Array;
	threadStats: SharedArrayBuffer;
	dataDir: string;
};

/** One thread's view: the replica's health, and which thread it is. */
export type ThreadHealthSource = AtomHealthSource & { thread: number };

export const isAtomReady = ({
	ready,
}: Pick<AtomHealthSource, "ready">): boolean => Atomics.load(ready, 0) !== 0;

/** Epoch seconds fit an Int32 until 2038; a second is fine for the load balancer's settle. */
export const markAtomReady = ({
	ready,
	at,
}: Pick<AtomHealthSource, "ready"> & { at: number }): void => {
	Atomics.store(ready, 0, Math.max(1, Math.floor(at / 1000)));
};

/** Epoch ms the Atom became ready at; null while starting. */
export const atomReadyAt = ({
	ready,
}: Pick<AtomHealthSource, "ready">): number | null => {
	const seconds = Atomics.load(ready, 0);
	return seconds === 0 ? null : seconds * 1000;
};

export const isThreadReady = ({
	threadsReady,
	thread,
}: Pick<ThreadHealthSource, "threadsReady" | "thread">): boolean =>
	Atomics.load(threadsReady, thread) === 1;

/** Whether this thread answers from its own files: the replica has started, and this thread has caught up since it last started. */
export const isServing = (
	health: Pick<ThreadHealthSource, "ready" | "threadsReady" | "thread">,
): boolean => isAtomReady(health) && isThreadReady(health);

const statusOf = ({
	ready,
	threadsReady,
}: Pick<AtomHealthSource, "ready" | "threadsReady">): AtomHealth["status"] => {
	if (!isAtomReady({ ready })) return "starting";
	return threadsReady.every((_, thread) =>
		isThreadReady({ threadsReady, thread }),
	)
		? "alive"
		: "degraded";
};

export const readAtomHealth = ({
	bootedAt,
	restarts,
	ready,
	threadsReady,
	threadStats,
	dataDir,
}: AtomHealthSource): AtomHealth => ({
	status: statusOf({ ready, threadsReady }),
	bootedAt,
	restarts: Atomics.load(restarts, 0),
	container: readContainerStats(),
	disk: readVolumeBytes({ path: dataDir }),
	threads: readThreadStats({ buffer: threadStats }).map((stats) => ({
		...stats,
		ready: isThreadReady({ threadsReady, thread: stats.index }),
	})),
});
