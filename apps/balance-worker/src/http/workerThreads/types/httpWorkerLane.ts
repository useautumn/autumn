import type {
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { FailFrame } from "../frames/failFrame.js";

/** A reply or failure waiting for room on its thread's reply ring, in the order it was produced. */
export type PendingReply =
	| {
			kind: "reply";
			reqId: number;
			status: number;
			partition: number;
			heldUntilSeq: number;
			metaText: string;
			body: Uint8Array;
	  }
	| { kind: "fail"; fail: FailFrame };

/** The decide thread's end of one HTTP worker thread. */
export type HttpWorkerLane = {
	index: number;
	thread: Worker;
	requests: RingReader;
	replies: RingWriter;
	/** Woken when a commit position moves, so the thread re-checks what it holds. */
	replySignal: RingSignal;
	/** Replies in production order; a head the full ring cannot take yet holds the rest behind it. */
	outbox: PendingReply[];
	pumping: boolean;
	/** Published replies not yet made visible; flushed once per event-loop turn. */
	dirty: boolean;
	/** Settles when the thread has closed its server, or has exited. */
	stopped: Promise<void>;
};
