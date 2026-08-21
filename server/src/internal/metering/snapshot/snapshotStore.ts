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
}
