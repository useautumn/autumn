export type PartitionLag = {
	partition: number;
	committed: number;
	latest: number;
	lag: number;
};
