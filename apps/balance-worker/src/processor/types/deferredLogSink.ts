export type DeferredLogSink = {
	add(log: Promise<void>): void;
};
