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

/**
 * Generic iteration over any kind-tagged scope iterator. Calls `perItem`
 * for every item, collecting per-item results into a summary.
 *
 * `concurrency` (default 1): max parallel `perItem` invocations. The
 * iterator's batch boundaries are preserved — work for batch N starts
 * only after the source yields it, but within and across batches up to
 * `concurrency` items run concurrently via a sliding worker pool.
 *
 * On error: keeps going with `onError: "continue"` (default), or rethrows
 * the first error with `onError: "throw"`. Either way every visited
 * item shows up in `results` so callers see the full audit trail.
 */
export const iterateScope = async <T>({
	iterate,
	perItem,
	onError = "continue",
	concurrency = 1,
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	perItem: (item: RunScopeItem) => Promise<T>;
	onError?: "throw" | "continue";
	concurrency?: number;
}): Promise<IterateScopeSummary<T>> => {
	const results: IterateScopeItemResult<T>[] = [];
	let succeeded = 0;
	let failed = 0;
	const maxParallel = Math.max(1, Math.floor(concurrency));

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

	if (maxParallel === 1) {
		for await (const batch of iterate()) {
			for (const item of batch) await runItem(item);
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
