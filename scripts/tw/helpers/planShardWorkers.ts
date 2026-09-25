export const planShardWorkers = ({
	workers,
	normalFileCount,
	svixFileCount,
}: {
	workers: number;
	normalFileCount: number;
	svixFileCount: number;
}) => {
	const totalFiles = normalFileCount + svixFileCount;
	const totalWorkers = Math.min(Math.max(1, workers), totalFiles);
	if (totalFiles === 0) throw new Error("No test files to run");
	if (normalFileCount > 0 && svixFileCount > 0 && totalWorkers < 2) {
		throw new Error("Mixed Svix and normal tests require --max>=2");
	}
	const svixWorkers = svixFileCount
		? Math.min(
				svixFileCount,
				totalWorkers - (normalFileCount > 0 ? 1 : 0),
				Math.max(1, Math.round((totalWorkers * svixFileCount) / totalFiles)),
			)
		: 0;
	return { totalWorkers, svixWorkers };
};
