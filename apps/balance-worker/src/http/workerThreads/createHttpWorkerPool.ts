/**
 * The decide thread's side of the HTTP worker threads: starts them, drains their request rings into the
 * worker's own `fetch` (the Hono app, unchanged), and writes each reply's bytes back to the thread that
 * holds the connection. The decide thread never accepts a socket.
 */
import { createRingSignal } from "../../threads/ring/ringSignal.js";
import { startDispatchLoop } from "./pool/dispatchRequests.js";
import { spawnHttpWorker } from "./pool/spawnHttpWorker.js";
import { stopHttpWorkers } from "./pool/stopHttpWorkers.js";
import type {
	HttpWorkerPool,
	HttpWorkerPoolConfig,
} from "./types/httpWorkerPool.js";
import type { HttpWorkerPoolScope } from "./types/httpWorkerPoolScope.js";

export function createHttpWorkerPool({
	ctx,
	config,
}: {
	ctx: HttpWorkerPoolScope["ctx"];
	config: HttpWorkerPoolConfig;
}): HttpWorkerPool {
	if (!Number.isSafeInteger(config.threads) || config.threads < 1)
		throw new RangeError("httpWorkers must be a positive integer");
	const scope: HttpWorkerPoolScope = {
		ctx,
		config,
		state: {
			lanes: [],
			requestSignal: createRingSignal(),
			stopping: false,
			failed: false,
			flushScheduled: false,
		},
	};

	function stop(): Promise<void> {
		return stopHttpWorkers({ scope });
	}

	/** Resolves once every thread is bound to the port; a thread that cannot bind takes the others down. */
	async function listen(): Promise<{ stop(): Promise<void> }> {
		const spawned = Array.from({ length: config.threads }, (_, index) =>
			spawnHttpWorker({ scope, index }),
		);
		for (const { lane } of spawned) scope.state.lanes.push(lane);
		try {
			await Promise.all(spawned.map(({ ready }) => ready));
		} catch (cause) {
			scope.state.stopping = true;
			for (const { lane } of spawned) lane.thread.terminate();
			throw cause;
		}
		startDispatchLoop({ scope });
		return { stop };
	}

	return { listen };
}
