import {
	FencedError,
	type MeteringSnapshot,
	type SnapshotStore,
} from "./snapshotStore.js";

export class InMemorySnapshotStore implements SnapshotStore {
	private readonly latest = new Map<number, MeteringSnapshot>();
	private readonly writeCounts = new Map<number, number>();

	async put({
		partition,
		epoch,
		offset,
		data,
	}: {
		partition: number;
		epoch: number;
		offset: number;
		data: string;
	}): Promise<void> {
		const stored = this.latest.get(partition);
		if (stored && epoch < stored.epoch) {
			throw new FencedError({ partition, epoch, storedEpoch: stored.epoch });
		}

		this.latest.set(partition, { partition, epoch, offset, data });
		this.writeCounts.set(partition, (this.writeCounts.get(partition) ?? 0) + 1);
	}

	async getLatest({
		partition,
	}: {
		partition: number;
	}): Promise<MeteringSnapshot | null> {
		return this.latest.get(partition) ?? null;
	}

	count({ partition }: { partition: number }): number {
		return this.writeCounts.get(partition) ?? 0;
	}
}
