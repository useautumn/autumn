/** Where a queued command's record that has not reached the log yet is handed, to land with its consumed batch. */
export type DeferredLogSink = {
	add(log: Promise<void>): void;
};
