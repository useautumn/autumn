/** A wake-up cell: any number of writers wake it, one reader sleeps on it. */
export type RingSignal = {
	readonly sab: SharedArrayBuffer;
	/** Wakes the reader only when it declared itself asleep, so a busy reader costs writers one atomic load. */
	wake(): boolean;
	/** `hasWork` is re-checked after declaring sleep: a publish in between either shows there or finds the
	 *  reader asleep and wakes it. Resolves false on timeout. */
	sleep(params: {
		hasWork: () => boolean;
		timeoutMs: number;
	}): Promise<boolean>;
};
