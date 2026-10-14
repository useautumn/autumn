import type {
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { FailFrame } from "../frames/failFrame.js";

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

export type HttpWorkerLane = {
	index: number;
	thread: Worker;
	requests: RingReader;
	replies: RingWriter;
	replySignal: RingSignal;
	outbox: PendingReply[];
	pumping: boolean;
	dirty: boolean;
	stopped: Promise<void>;
};
