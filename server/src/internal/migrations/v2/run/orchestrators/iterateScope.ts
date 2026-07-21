import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";
import type { RunScopeItem } from "../types/runScope.js";

export type IterateScopeItemResult<T> =
	| { status: "ok"; item: RunScopeItem; value: T }
	| { status: "failed"; item: RunScopeItem; error: Error };

export type IterateScopeSummary<T> = {
	processed: number;
	succeeded: number;
	failed: number;
	results: IterateScopeItemResult<T>[];
};

/** Iterates scope items; a scheduler forces sequential execution and may yield between items.
 * Errors are collected by default or rethrown when `onError` is `throw`. */
export const iterateScope = async <T>({
	iterate,
	perItem,
	onError = "continue",
	concurrency = 1,
	scheduler,
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	perItem: (item: RunScopeItem) => Promise<T>;
	onError?: "throw" | "continue";
	concurrency?: number;
	scheduler?: MigrationRunScheduler;
}): Promise<IterateScopeSummary<T>> => {
	const results: IterateScopeItemResult<T>[] = [];
	let succeeded = 0;
	let failed = 0;
	const maxParallel = scheduler ? 1 : Math.max(1, Math.floor(concurrency));
	let sliceStartedAtMs = scheduler?.now();
	let hasProcessedScheduledItem = false;

	const runItem = async (item: RunScopeItem) => {
		try {
			const value = await perItem(item);
			results.push({ status: "ok", item, value });
			succeeded++;
		} catch (raw) {
			const error = raw instanceof Error ? raw : new Error(String(raw));
			results.push({ status: "failed", item, error });
			failed++;
			if (onError === "throw") throw error;
		}
	};

	const completeScheduledSliceIfDue = async () => {
		if (
			!scheduler ||
			!hasProcessedScheduledItem ||
			sliceStartedAtMs === undefined ||
			scheduler.now() - sliceStartedAtMs < scheduler.sliceDurationMs
		) {
			return;
		}

		await scheduler.onSliceComplete();
		sliceStartedAtMs = scheduler.now();
	};

	if (maxParallel === 1) {
		for await (const batch of iterate()) {
			for (const item of batch) {
				await completeScheduledSliceIfDue();
				await runItem(item);
				hasProcessedScheduledItem = true;
			}
		}
		return { processed: succeeded + failed, succeeded, failed, results };
	}

	const inflight = new Set<Promise<void>>();
	const schedule = (item: RunScopeItem) => {
		const p = runItem(item).finally(() => {
			inflight.delete(p);
		});
		inflight.add(p);
	};

	for await (const batch of iterate()) {
		for (const item of batch) {
			schedule(item);
			if (inflight.size >= maxParallel) {
				await Promise.race(inflight);
			}
		}
	}
	await Promise.all(inflight);

	return { processed: succeeded + failed, succeeded, failed, results };
};
