import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";
import type { RunScopeItem } from "../types/runScope.js";

export type IterateScopeItemResult<T> =
	| { status: "ok"; item: RunScopeItem; value: T }
	| { status: "failed"; item: RunScopeItem; error: Error };

export type IterateScopeCompletion = "exhausted" | "slice_complete" | "stopped";

export type IterateScopeSummary<T> = {
	processed: number;
	succeeded: number;
	failed: number;
	results: IterateScopeItemResult<T>[];
	completion: IterateScopeCompletion;
	cursor: string | null;
};

/** Iterates scope items; a scheduler forces sequential execution and ends between items.
 * Errors are collected by default or rethrown when `onError` is `throw`. */
export const iterateScope = async <T>({
	iterate,
	perItem,
	onError = "continue",
	concurrency = 1,
	scheduler,
	shouldStop,
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	perItem: (item: RunScopeItem) => Promise<T>;
	onError?: "throw" | "continue";
	concurrency?: number;
	scheduler?: MigrationRunScheduler;
	shouldStop?: () => boolean;
}): Promise<IterateScopeSummary<T>> => {
	const results: IterateScopeItemResult<T>[] = [];
	let succeeded = 0;
	let failed = 0;
	const maxParallel = scheduler ? 1 : Math.max(1, Math.floor(concurrency));
	const sliceStartedAtMs = scheduler?.now();
	let hasProcessedScheduledItem = false;
	const summarize = (
		completion: IterateScopeCompletion,
	): IterateScopeSummary<T> => ({
		processed: succeeded + failed,
		succeeded,
		failed,
		results,
		completion,
		cursor: results[results.length - 1]?.item.internal_id ?? null,
	});

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

	const scheduledSliceIsComplete = () =>
		scheduler !== undefined &&
		hasProcessedScheduledItem &&
		sliceStartedAtMs !== undefined &&
		scheduler.now() - sliceStartedAtMs >= scheduler.sliceDurationMs;

	if (maxParallel === 1) {
		for await (const batch of iterate()) {
			for (const item of batch) {
				if (shouldStop?.()) return summarize("stopped");
				if (scheduledSliceIsComplete()) return summarize("slice_complete");
				await runItem(item);
				hasProcessedScheduledItem = true;
				if (shouldStop?.()) return summarize("stopped");
			}
		}
		return summarize("exhausted");
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
			if (shouldStop?.()) {
				await Promise.all(inflight);
				return summarize("stopped");
			}
			schedule(item);
			if (inflight.size >= maxParallel) {
				await Promise.race(inflight);
				if (shouldStop?.()) {
					await Promise.all(inflight);
					return summarize("stopped");
				}
			}
		}
	}
	await Promise.all(inflight);

	return summarize(shouldStop?.() ? "stopped" : "exhausted");
};
