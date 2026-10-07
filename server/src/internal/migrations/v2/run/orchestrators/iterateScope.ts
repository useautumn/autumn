import type { RunScopeItem } from "../types/runScope.js";

export type IterateScopeItemResult<T> =
	| { status: "ok"; item: RunScopeItem; value: T }
	| { status: "failed"; item: RunScopeItem; error: Error };

export type IterateScopeCompletion = "exhausted" | "stopped";

export type IterateScopeSummary<T> = {
	processed: number;
	succeeded: number;
	failed: number;
	results: IterateScopeItemResult<T>[];
	completion: IterateScopeCompletion;
	cursor: string | null;
};

/** Iterates scope items up to `concurrency` in flight. Errors continue or rethrow. */
export const iterateScope = async <T>({
	iterate,
	perItem,
	onError = "continue",
	concurrency = 1,
	shouldStop,
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	perItem: (item: RunScopeItem) => Promise<T>;
	onError?: "throw" | "continue";
	concurrency?: number;
	shouldStop?: () => boolean;
}): Promise<IterateScopeSummary<T>> => {
	const results: IterateScopeItemResult<T>[] = [];
	let succeeded = 0;
	let failed = 0;
	const maxParallel = Math.max(1, Math.floor(concurrency));
	let lastScheduledItem: RunScopeItem | undefined;
	const summarize = (
		completion: IterateScopeCompletion,
	): IterateScopeSummary<T> => ({
		processed: succeeded + failed,
		succeeded,
		failed,
		results,
		completion,
		// Last scheduled, not last finished: a finish-order cursor can re-expose handled items.
		cursor: lastScheduledItem?.internal_id ?? null,
	});

	const runItem = async (item: RunScopeItem) => {
		lastScheduledItem = item;
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

	if (maxParallel === 1) {
		for await (const batch of iterate()) {
			for (const item of batch) {
				if (shouldStop?.()) return summarize("stopped");
				await runItem(item);
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

	const drain = async (completion: IterateScopeCompletion) => {
		await Promise.all(inflight);
		return summarize(completion);
	};

	for await (const batch of iterate()) {
		for (const item of batch) {
			if (shouldStop?.()) return drain("stopped");
			schedule(item);
			if (inflight.size >= maxParallel) {
				await Promise.race(inflight);
				if (shouldStop?.()) return drain("stopped");
			}
		}
	}
	await Promise.all(inflight);

	return summarize(shouldStop?.() ? "stopped" : "exhausted");
};
