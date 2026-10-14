import { readVolumeBytes } from "../disk/readVolumeBytes.js";
import {
	readThreadStats,
	type ThreadStats,
} from "../threads/stats/threadStats.js";
import { type ContainerStats, readContainerStats } from "./containerStats.js";

export type AtomHealth = {
	status: "alive" | "degraded" | "starting";
	bootedAt: string;
	restarts: number;
	container: ContainerStats;
	disk: { totalBytes: number; availBytes: number };
	threads: (ThreadStats & { ready: boolean })[];
};

export type AtomHealthSource = {
	bootedAt: string;
	restarts: Int32Array;
	ready: Int32Array;
	threadsReady: Int32Array;
	threadStats: SharedArrayBuffer;
	dataDir: string;
};

export type ThreadHealthSource = AtomHealthSource & { thread: number };

export const isAtomReady = ({
	ready,
}: Pick<AtomHealthSource, "ready">): boolean => Atomics.load(ready, 0) === 1;

export const isThreadReady = ({
	threadsReady,
	thread,
}: Pick<ThreadHealthSource, "threadsReady" | "thread">): boolean =>
	Atomics.load(threadsReady, thread) === 1;

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
