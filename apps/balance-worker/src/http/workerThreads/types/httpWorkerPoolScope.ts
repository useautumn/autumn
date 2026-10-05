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
	};
};
