/** What a rewind to the last commit hands one partition's job again. */
export type RewoundPartition = {
	partition: number;
	/** Records handed to the job past the partition's last commit. */
	records: number;
	/** From the first of those slices starting to the last one ending. */
	ranMs: number;
};

export type UncommittedLandings = {
	/** One slice handed to the job, landed or cut short; one right after an uncommitted slice extends it. */
	recordSlice(params: {
		partition: number;
		firstOffset: bigint;
		nextOffset: bigint;
		startedAtMs: number;
		endedAtMs: number;
	}): void;
	/** What rewinding these partitions repeats; everything held is forgotten, as the rewind starts over. */
	takeRewound(params: { partitions: number[] }): RewoundPartition[];
};
