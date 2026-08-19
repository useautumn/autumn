/**
 * Runs `run` over `items` with at most `concurrency` in flight. Results keep
 * input order. On failure no new items start, in-flight items run to
 * completion (so no writes are left mid-air), and the first error rethrows.
 */
export const mapWithConcurrency = async <T, R>({
	items,
	concurrency,
	run,
}: {
	items: T[];
	concurrency: number;
	run: (item: T) => Promise<R>;
}): Promise<R[]> => {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	let failed = false;
	let firstError: unknown;

	const worker = async () => {
		while (!failed && nextIndex < items.length) {
			const index = nextIndex++;
			try {
				results[index] = await run(items[index]);
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
		}
	};

	await Promise.all(
		Array.from(
			{ length: Math.max(1, Math.min(concurrency, items.length)) },
			worker,
		),
	);

	if (failed) throw firstError;
	return results;
};
