import type { AutumnLogger } from "@autumn/logging";
import type { RingSignal } from "../../../threads/ring/types/ringSignal.js";
import type { HttpWorkerLane } from "./httpWorkerLane.js";
import type { HttpWorkerPoolConfig } from "./httpWorkerPool.js";

export type HttpWorkerPoolScope = {
	ctx: {
		fetch(request: Request): Response | Promise<Response>;
		logger: Pick<AutumnLogger, "error">;
		onFatal(failure: { cause: unknown }): void;
	};
	config: HttpWorkerPoolConfig;
	state: {
		lanes: HttpWorkerLane[];
		requestSignal: RingSignal;
		stopping: boolean;
		failed: boolean;
		flushScheduled: boolean;
		heldOnDecideThread: HeldOnDecideThread[];
		health: HttpWorkerHealthCounts;
		latencyCells: SharedArrayBuffer;
	};
};

export type HttpWorkerHealthCounts = {
	ringFullWaits: number;
	heldReplies: number;
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
