/** How many customers a given run covers. A scoped run carries its own size,
 * so the progress bar reads "0 of 1" rather than the whole filter count. */
export function runExpectedCount({
	run,
	filterCount,
}: {
	run: { only_ids: string[] | null; target_limit: number | null } | undefined;
	filterCount: number | null;
}): number | null {
	if (!run) return filterCount;
	if (run.only_ids !== null) return run.only_ids.length;
	if (run.target_limit !== null)
		return filterCount === null
			? run.target_limit
			: Math.min(run.target_limit, filterCount);
	return filterCount;
}
