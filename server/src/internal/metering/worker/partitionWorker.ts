import { applyEvent } from "../fold/applyEvent.js";
import { canonicalSerialize } from "../fold/canonicalSerialize.js";
import {
	createMeterState,
	DEFAULT_DEDUPE_CAPACITY,
	deserializeMeterState,
	type MeterState,
	readFeatureMeter,
} from "../fold/meterState.js";
import type { MeteringLog } from "../log/meteringLog.js";
import type { SnapshotStore } from "../snapshot/snapshotStore.js";

export const DEFAULT_SNAPSHOT_INTERVAL = 1000;
const READ_BATCH_SIZE = 500;

export class PartitionWorker {
	readonly partition: number;
	private readonly log: MeteringLog;
	private readonly snapshotStore: SnapshotStore;
	private readonly snapshotInterval: number;
	private readonly dedupeCapacity: number;
	private meterState: MeterState;
	private nextOffset = 0;
	private currentEpoch = 0;
	private eventsSinceSnapshot = 0;

	constructor({
		partition,
		log,
		snapshotStore,
		snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL,
		dedupeCapacity = DEFAULT_DEDUPE_CAPACITY,
	}: {
		partition: number;
		log: MeteringLog;
		snapshotStore: SnapshotStore;
		snapshotInterval?: number;
		dedupeCapacity?: number;
	}) {
		this.partition = partition;
		this.log = log;
		this.snapshotStore = snapshotStore;
		this.snapshotInterval = Math.max(1, snapshotInterval);
		this.dedupeCapacity = dedupeCapacity;
		this.meterState = createMeterState({ dedupeCapacity });
	}

	get offset(): number {
		return this.nextOffset;
	}

	get epoch(): number {
		return this.currentEpoch;
	}

	get state(): MeterState {
		return this.meterState;
	}

	async takeOwnership(): Promise<void> {
		const latest = await this.snapshotStore.getLatest({
			partition: this.partition,
		});

		this.currentEpoch = (latest?.epoch ?? 0) + 1;
		this.meterState = latest
			? deserializeMeterState({ serialized: latest.data })
			: createMeterState({ dedupeCapacity: this.dedupeCapacity });
		this.nextOffset = latest?.offset ?? 0;
		this.eventsSinceSnapshot = 0;
	}

	async consume({ upTo }: { upTo?: number } = {}): Promise<{
		applied: number;
		offset: number;
	}> {
		let applied = 0;

		while (upTo === undefined || this.nextOffset <= upTo) {
			const limit =
				upTo === undefined
					? READ_BATCH_SIZE
					: Math.min(READ_BATCH_SIZE, upTo - this.nextOffset + 1);
			const records = await this.log.read({
				fromOffset: this.nextOffset,
				limit,
			});
			if (records.length === 0) break;

			for (const record of records) {
				this.meterState = applyEvent({
					state: this.meterState,
					event: record.event,
				}).state;
				this.nextOffset = record.offset + 1;
				applied++;
				this.eventsSinceSnapshot++;

				if (this.eventsSinceSnapshot >= this.snapshotInterval) {
					await this.writeSnapshot();
				}
			}
		}

		return { applied, offset: this.nextOffset };
	}

	check({ customerId, featureId }: { customerId: string; featureId: string }): {
		balance: number;
		allowed: boolean;
	} {
		const meter = readFeatureMeter({
			state: this.meterState,
			customerId,
			featureId,
		});
		const balance = meter?.balance ?? 0;
		return { balance, allowed: balance > 0 };
	}

	private async writeSnapshot(): Promise<void> {
		await this.snapshotStore.put({
			partition: this.partition,
			epoch: this.currentEpoch,
			offset: this.nextOffset,
			data: canonicalSerialize({ state: this.meterState }),
		});
		this.eventsSinceSnapshot = 0;
	}
}
