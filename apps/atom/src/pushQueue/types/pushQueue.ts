/** One queued push as pulled: the payload Autumn queued, the handle that acks it, and which delivery this is (from 1). */
export type PulledPush = {
	payload: string;
	receiptHandle: string;
	attempt: number;
};

/** The org's queue of Autumn's pushes: pulled a batch at a time, each acked once applied. */
export type PushQueue = {
	/** Waits up to SQS's long poll for pushes; empty when none came. Aborting the signal ends the wait where the client allows it. */
	pull(params: { signal: AbortSignal }): Promise<PulledPush[]>;
	ack(receiptHandle: string): Promise<void>;
};
