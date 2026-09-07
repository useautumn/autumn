import type { WorkerLifecycleScope } from "../types/balanceWorkerState.js";
import { completeWorkerShutdown } from "./stopWorker.js";

export async function startWorker({
	ctx,
	state,
}: WorkerLifecycleScope): Promise<void> {
	if (state.status !== "created") {
		throw new Error(`Cannot start worker while ${state.status}`);
	}
	state.startup = completeWorkerStartup({ ctx, state });
	return state.startup;
}

async function completeWorkerStartup({
	ctx,
	state,
}: WorkerLifecycleScope): Promise<void> {
	state.status = "starting";
	try {
		state.listener = ctx.listen();
		await ctx.partitions.start();
		state.status = "running";
	} catch (cause) {
		try {
			// Startup cleanup must not wait for its own startup promise.
			await completeWorkerShutdown({ ctx, state });
		} catch (cleanupCause) {
			throw new AggregateError(
				[cause, cleanupCause],
				"Worker startup and cleanup failed",
			);
		}
		throw cause;
	}
}
