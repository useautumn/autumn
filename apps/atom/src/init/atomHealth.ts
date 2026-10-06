export type AtomHealth = {
	status: "alive";
	bootedAt: string;
	restarts: number;
};

/** What every thread's /health reports: the main thread's boot, and how many threads it has replaced since. */
export type AtomHealthSource = {
	bootedAt: string;
	/** One Int32 the main thread counts in. */
	restarts: Int32Array;
};

export const readAtomHealth = ({
	bootedAt,
	restarts,
}: AtomHealthSource): AtomHealth => ({
	status: "alive",
	bootedAt,
	restarts: Atomics.load(restarts, 0),
});
