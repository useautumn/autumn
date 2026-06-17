export const mapWithConcurrency = async <T, R>({
	list,
	concurrency,
	fn,
}: {
	list: T[];
	concurrency: number;
	fn: (item: T, index: number) => Promise<R>;
}) => {
	const results: R[] = [];
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(concurrency, 1), list.length);

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < list.length) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				results[currentIndex] = await fn(list[currentIndex], currentIndex);
			}
		}),
	);

	return results;
};
