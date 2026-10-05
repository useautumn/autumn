import type { LatencyPercentiles } from "../latency/latencyCells.js";
import type { HttpWorkerHealthCounts } from "./httpWorkerPoolScope.js";
import type { HeldFailure, InlineHandler } from "./inlineHandler.js";

export type HttpWorkerPoolConfig = {
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	/** `Bun.serve` threads beside the decide thread. */
	threads: number;
	/** Per thread, powers of two. */
	requestRingBytes: number;
	replyRingBytes: number;
	/** POST routes decided inline, their replies held by commit position; absent, every request goes to `fetch`. */
	inline?: {
		routes: string[];
		handler: InlineHandler;
		commitCells: SharedArrayBuffer;
		failureCounts: SharedArrayBuffer;
	};
};

export type HttpWorkerListener = {
	stop(): Promise<void>;
	/** A partition's commit position moved: held replies it reached may go out. */
	commitPositionMoved(params: { partition: number; seq: number }): void;
	failHeld(failure: HeldFailure): void;
	/** The window's counts, reset by the read; `heldOnDecideThread` is a gauge. */
	drainHealth(): HttpWorkerHealthCounts & { heldOnDecideThread: number };
	/** In-worker latency per inline route path this window, from arrival to answer; null when none arrived. */
	drainLatencies(): Record<string, LatencyPercentiles | null>;
};

export type HttpWorkerPool = {
	/** Resolves once every thread is bound to the port. */
	listen(): Promise<HttpWorkerListener>;
};
