/** Splits the run's workers across the normal pool and each capability shard, in `capabilityFileCounts` order. */
export const planShardWorkers = ({
	workers,
	normalFileCount,
	capabilityFileCounts,
}: {
	workers: number;
	normalFileCount: number;
	capabilityFileCounts: number[];
}) => {
	const totalFiles =
		normalFileCount + capabilityFileCounts.reduce((sum, n) => sum + n, 0);
	if (totalFiles === 0) throw new Error("No test files to run");
	const totalWorkers = Math.min(Math.max(1, workers), totalFiles);
	const shardCount = [normalFileCount, ...capabilityFileCounts].filter(
		(count) => count > 0,
	).length;
	if (totalWorkers < shardCount) {
		throw new Error(`Selected test shards require --max>=${shardCount}`);
	}

	// Each later non-empty shard keeps one worker in reserve; the last shard takes the rest.
	let unplannedShards = shardCount;
	let remainingWorkers = totalWorkers;
	const capabilityWorkers = capabilityFileCounts.map((fileCount) => {
		if (fileCount === 0) return 0;
		unplannedShards--;
		const share =
			unplannedShards === 0
				? Math.min(fileCount, remainingWorkers)
				: Math.min(
						fileCount,
						remainingWorkers - unplannedShards,
						Math.max(1, Math.round((totalWorkers * fileCount) / totalFiles)),
					);
		remainingWorkers -= share;
		return share;
	});
	return { totalWorkers, capabilityWorkers };
};
