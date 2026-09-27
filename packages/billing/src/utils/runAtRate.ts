/** Runs `run` over `items` no faster than `perSecond`, in parallel batches of that size. */
export const runAtRate = async <T>({
	items,
	perSecond,
	run,
}: {
	items: T[];
	perSecond: number;
	run: (item: T) => Promise<void>;
}): Promise<void> => {
	for (let start = 0; start < items.length; start += perSecond) {
		const batchStartedAt = Date.now();
		await Promise.all(items.slice(start, start + perSecond).map(run));
		const remaining = 1000 - (Date.now() - batchStartedAt);
		const hasMore = start + perSecond < items.length;
		if (hasMore && remaining > 0)
			await new Promise((resolve) => setTimeout(resolve, remaining));
	}
};
