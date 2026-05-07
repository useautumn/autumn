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
 * for every item, collecting per-item results into a summary. Sequential
 * by default; concurrency layer is intentionally out of scope here.
 *
 * On error: keeps going with `onError: "continue"` (default), or rethrows
 * the first error with `onError: "throw"`. Either way every visited
 * item shows up in `results` so callers see the full audit trail.
 */
export const iterateScope = async <T>({
	iterate,
	perItem,
	onError = "continue",
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	perItem: (item: RunScopeItem) => Promise<T>;
	onError?: "throw" | "continue";
}): Promise<IterateScopeSummary<T>> => {
	const results: IterateScopeItemResult<T>[] = [];
	let succeeded = 0;
	let failed = 0;

	for await (const batch of iterate()) {
		for (const item of batch) {
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
		}
	}

	return { processed: succeeded + failed, succeeded, failed, results };
};
