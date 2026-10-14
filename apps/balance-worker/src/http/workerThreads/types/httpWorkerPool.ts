import type { LatencyPercentiles } from "../latency/latencyCells.js";
import type { HttpWorkerHealthCounts } from "./httpWorkerPoolScope.js";
import type { HeldFailure, InlineHandler } from "./inlineHandler.js";

export type HttpWorkerPoolConfig = {
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	threads: number;
	requestRingBytes: number;
	replyRingBytes: number;
	inline?: {
		routes: string[];
		handler: InlineHandler;
		commitCells: SharedArrayBuffer;
		failureCounts: SharedArrayBuffer;
	};
};

export type HttpWorkerListener = {
	stop(): Promise<void>;
	commitPositionMoved(params: { partition: number; seq: number }): void;
	failHeld(failure: HeldFailure): void;
	drainHealth(): HttpWorkerHealthCounts & { heldOnDecideThread: number };
	drainLatencies(): Record<string, LatencyPercentiles | null>;
};

export type HttpWorkerPool = {
	listen(): Promise<HttpWorkerListener>;
};
