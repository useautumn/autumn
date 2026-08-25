import {
	FencedError,
	type MeteringSnapshot,
	type SnapshotStore,
} from "./snapshotStore.js";

export class InMemorySnapshotStore implements SnapshotStore {
	private readonly latest = new Map<number, MeteringSnapshot>();
	private readonly writeCounts = new Map<number, number>();
	private readonly claimedEpochs = new Map<number, Set<number>>();

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

	// Mirrors the S3 store's read-candidate -> conditional-claim -> retry loop:
	// the `await` between computing a candidate and committing it is what makes
	// two concurrent callers a genuine race instead of trivially serialized
	// calls, the same gap real network I/O would leave open.
	async claimEpoch({ partition }: { partition: number }): Promise<number> {
		for (;;) {
			const candidate = this.nextCandidate({ partition });

			await Promise.resolve();

			const claims = this.claimedEpochs.get(partition) ?? new Set<number>();
			if (claims.has(candidate)) continue;

			claims.add(candidate);
			this.claimedEpochs.set(partition, claims);
			return candidate;
		}
	}

	count({ partition }: { partition: number }): number {
		return this.writeCounts.get(partition) ?? 0;
	}

	private nextCandidate({ partition }: { partition: number }): number {
		const storedEpoch = this.latest.get(partition)?.epoch ?? 0;
		const claims = this.claimedEpochs.get(partition);
		const highestClaim = claims && claims.size > 0 ? Math.max(...claims) : 0;
		return Math.max(storedEpoch, highestClaim) + 1;
	}
}
