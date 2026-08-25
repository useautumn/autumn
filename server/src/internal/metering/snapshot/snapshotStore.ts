export type MeteringSnapshot = {
	partition: number;
	epoch: number;
	offset: number;
	data: string;
};

export class FencedError extends Error {
	readonly partition: number;
	readonly epoch: number;
	readonly storedEpoch: number;

	constructor({
		partition,
		epoch,
		storedEpoch,
	}: {
		partition: number;
		epoch: number;
		storedEpoch: number;
	}) {
		super(
			`Snapshot write fenced on partition ${partition}: epoch ${epoch} is behind stored epoch ${storedEpoch}`,
		);
		this.name = "FencedError";
		this.partition = partition;
		this.epoch = epoch;
		this.storedEpoch = storedEpoch;
	}
}

export interface SnapshotStore {
	put(params: {
		partition: number;
		epoch: number;
		offset: number;
		data: string;
	}): Promise<void>;
	getLatest(params: { partition: number }): Promise<MeteringSnapshot | null>;
	// Durably claims the next epoch for a partition and returns it. Must never
	// hand out the same epoch twice for the same partition, even to concurrent
	// callers racing on ownership after a crash — including a claim that was
	// never followed by a snapshot write, which `put()`'s fencing alone can't
	// see coming.
	claimEpoch(params: { partition: number }): Promise<number>;
}
