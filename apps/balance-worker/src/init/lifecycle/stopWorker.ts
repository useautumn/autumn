import type { WorkerLifecycleScope } from "../types/balanceWorkerState.js";

export function stopWorker({
	ctx,
	state,
}: WorkerLifecycleScope): Promise<void> {
	state.stopping ??= finishWorkerStop({ ctx, state });
	return state.stopping;
}

async function finishWorkerStop({
	ctx,
	state,
}: WorkerLifecycleScope): Promise<void> {
	if (state.status === "starting") {
		try {
			await state.startup;
		} catch {
			// Startup owns reporting its failure and attempting cleanup.
		}
	}
	if (state.status !== "stopped") await completeWorkerShutdown({ ctx, state });
}

export async function completeWorkerShutdown({
	ctx,
	state,
}: WorkerLifecycleScope): Promise<void> {
	state.status = "stopping";
	const errors: unknown[] = [];
	try {
		await ctx.partitions.stop();
	} catch (cause) {
		errors.push(cause);
	}
	try {
		await state.listener?.stop();
	} catch (cause) {
		errors.push(cause);
	}
	try {
		await ctx.settleResources();
		ctx.closeStore();
	} catch (cause) {
		errors.push(cause);
	}
	state.status = "stopped";
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1)
		throw new AggregateError(errors, "Worker shutdown failed");
}
