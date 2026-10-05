import type {
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";

/** A reply waiting for room on its thread's reply ring, in the order it was produced. */
export type PendingReply = {
	reqId: number;
	status: number;
	metaText: string;
	body: Uint8Array;
};

/** The decide thread's end of one HTTP worker thread. */
export type HttpWorkerLane = {
	index: number;
	thread: Worker;
	requests: RingReader;
	replies: RingWriter;
	/** Replies in production order; a head the full ring cannot take yet holds the rest behind it. */
	outbox: PendingReply[];
	pumping: boolean;
	/** Published replies not yet made visible; flushed once per event-loop turn. */
	dirty: boolean;
	/** Settles when the thread has closed its server, or has exited. */
	stopped: Promise<void>;
};
