import type { AutumnLogger } from "@autumn/logging";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { HttpWorkerLane } from "./httpWorkerLane.js";
import type { HttpWorkerPoolConfig } from "./httpWorkerPool.js";

/** What the pool's steps share: its dependencies, its layout, and the state of its threads. */
export type HttpWorkerPoolScope = {
	ctx: {
		fetch(request: Request): Response | Promise<Response>;
		logger: Pick<AutumnLogger, "error">;
		/** A thread died or the drain loop broke: the pool cannot serve again on its own, so the task is replaced. */
		onFatal(failure: { cause: unknown }): void;
	};
	config: HttpWorkerPoolConfig;
	state: {
		lanes: HttpWorkerLane[];
		/** Every thread wakes it when it publishes requests; the drain loop sleeps on it. */
		requestSignal: RingSignal;
		stopping: boolean;
		failed: boolean;
		flushScheduled: boolean;
		/** Held replies too big for the ring, waiting here for their commit position. */
		heldOnDecideThread: HeldOnDecideThread[];
		health: HttpWorkerHealthCounts;
		/** Every thread's latency histograms for the inline routes; see `latencyCells`. */
		latencyCells: SharedArrayBuffer;
	};
};

/** Counted per window and drained by the summary line. */
export type HttpWorkerHealthCounts = {
	/** Times a reply waited for a thread to read its full ring. */
	ringFullWaits: number;
	heldReplies: number;
	/** Failure ranges published to the threads. */
	failRanges: number;
};

export type HeldOnDecideThread = {
	lane: HttpWorkerLane;
	reqId: number;
	partition: number;
	seq: number;
	status: number;
	headers: [string, string][];
	body: Uint8Array;
};
