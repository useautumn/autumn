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

	// Every later non-empty shard, the normal pool included, keeps one worker in reserve.
	let unplannedShards = shardCount;
	let remainingWorkers = totalWorkers;
	const capabilityWorkers = capabilityFileCounts.map((fileCount) => {
		if (fileCount === 0) return 0;
		unplannedShards--;
		// Only without normal files can a capability shard be last and take the leftovers.
		const takesLeftovers = normalFileCount === 0 && unplannedShards === 0;
		const share = takesLeftovers
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
