export type RingSignal = {
	readonly sab: SharedArrayBuffer;
	wake(): boolean;
	sleep(params: {
		hasWork: () => boolean;
		timeoutMs: number;
	}): Promise<boolean>;
};
