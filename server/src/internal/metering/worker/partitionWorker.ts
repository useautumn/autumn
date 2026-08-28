import type { MeteringEvent } from "../events/meteringEventSchema.js";
import { applyEvent } from "../fold/applyEvent.js";
import { canonicalSerialize } from "../fold/canonicalSerialize.js";
import {
	createMeterState,
	DEFAULT_DEDUPE_CAPACITY,
	deserializeMeterState,
	type MeterState,
	readFeatureMeter,
	UnsupportedMeterStateVersionError,
} from "../fold/meterState.js";
import type { MeteringLog } from "../log/meteringLog.js";
import type { SnapshotStore } from "../snapshot/snapshotStore.js";
import { createSliceRunner, yieldToEventLoop } from "./sliceRunner.js";

export const DEFAULT_SNAPSHOT_INTERVAL = 1000;
const READ_BATCH_SIZE = 500;

// A fold turn processes at most this many events, or runs for at most this
// long, before yielding the event loop — so a long backlog (a full Kafka
// batch, or a crash-restore replay) doesn't starve concurrent /check
// requests or kafkajs's own background heartbeat loop.
const DEFAULT_FOLD_SLICE_BUDGET_EVENTS = 32;
const DEFAULT_FOLD_SLICE_BUDGET_MS = 1;

export class PartitionWorker {
	readonly partition: number;
	private readonly log: MeteringLog;
	private readonly snapshotStore: SnapshotStore;
	private readonly snapshotInterval: number;
	private readonly dedupeCapacity: number;
	private readonly foldSliceBudgetEvents: number;
	private readonly foldSliceBudgetMs: number;
	private readonly yieldFn: () => Promise<void>;
	private meterState: MeterState;
	private nextOffset = 0;
	private currentEpoch = 0;
	private eventsSinceSnapshot = 0;
	private requiredHighWatermark: number | null = null;

	constructor({
		partition,
		log,
		snapshotStore,
		snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL,
		dedupeCapacity = DEFAULT_DEDUPE_CAPACITY,
		foldSliceBudgetEvents = DEFAULT_FOLD_SLICE_BUDGET_EVENTS,
		foldSliceBudgetMs = DEFAULT_FOLD_SLICE_BUDGET_MS,
		yieldFn = yieldToEventLoop,
	}: {
		partition: number;
		log: MeteringLog;
		snapshotStore: SnapshotStore;
		snapshotInterval?: number;
		dedupeCapacity?: number;
		foldSliceBudgetEvents?: number;
		foldSliceBudgetMs?: number;
		yieldFn?: () => Promise<void>;
	}) {
		this.partition = partition;
		this.log = log;
		this.snapshotStore = snapshotStore;
		this.snapshotInterval = Math.max(1, snapshotInterval);
		this.dedupeCapacity = dedupeCapacity;
		this.foldSliceBudgetEvents = foldSliceBudgetEvents;
		this.foldSliceBudgetMs = foldSliceBudgetMs;
		this.yieldFn = yieldFn;
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

	get targetOffset(): number | null {
		return this.requiredHighWatermark;
	}

	get isReady(): boolean {
		return (
			this.requiredHighWatermark !== null &&
			this.nextOffset >= this.requiredHighWatermark
		);
	}

	async takeOwnership(): Promise<void> {
		const latest = await this.snapshotStore.getLatest({
			partition: this.partition,
		});

		this.currentEpoch = await this.snapshotStore.claimEpoch({
			partition: this.partition,
		});
		this.requiredHighWatermark = null;
		try {
			this.meterState = latest
				? deserializeMeterState({ serialized: latest.data })
				: createMeterState({ dedupeCapacity: this.dedupeCapacity });
			this.nextOffset = latest?.offset ?? 0;
		} catch (error) {
			if (!(error instanceof UnsupportedMeterStateVersionError)) throw error;

			// An unversioned snapshot used customer_id alone as its key. Replaying the
			// durable log is the only safe way to rebuild org/env-scoped balances.
			this.meterState = createMeterState({
				dedupeCapacity: this.dedupeCapacity,
			});
			this.nextOffset = 0;
		}
		this.eventsSinceSnapshot = 0;
	}

	async captureHighWatermark(): Promise<number> {
		this.requiredHighWatermark = await this.log.getHighWatermark();
		return this.requiredHighWatermark;
	}

	async consume({ upTo }: { upTo?: number } = {}): Promise<{
		applied: number;
		offset: number;
	}> {
		let applied = 0;
		const sliceRunner = createSliceRunner({
			budgetMs: this.foldSliceBudgetMs,
			budgetEvents: this.foldSliceBudgetEvents,
			yieldFn: this.yieldFn,
		});

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

				// Snapshot cadence and offset accounting above are unaffected by
				// this: the slice runner only decides when to hand the event loop
				// a turn, never how many events get folded or when they snapshot.
				await sliceRunner.tick();
			}
		}

		return { applied, offset: this.nextOffset };
	}

	/**
	 * Command path: the worker owns this write instead of only observing it.
	 * Appends to the log, waits for the broker to ack, then folds the event
	 * into local state so the reply already reflects it.
	 *
	 * `nextOffset` is deliberately left alone. The consumer still walks every
	 * offset in order and will read this same event back; `applyEvent` answers
	 * "duplicate" for it because the id is already in the dedupe window, and
	 * that window is part of the serialized state, so the swallow survives a
	 * snapshot restore too.
	 *
	 * A rejected deduct follows the fold's own semantics: the balance is left
	 * alone, the id is still consumed, and `allowed` is false.
	 */
	async command({ event }: { event: MeteringEvent }): Promise<{
		balance: number;
		allowed: boolean;
		duplicate: boolean;
	}> {
		await this.log.append({ event });

		const { state, result } = applyEvent({ state: this.meterState, event });
		this.meterState = state;

		return {
			// A duplicate already got its answer under this id; re-reporting it as
			// rejected would make a retry look like a failure.
			allowed: result !== "rejected_insufficient",
			balance:
				readFeatureMeter({
					state: this.meterState,
					orgId: event.org_id,
					env: event.env,
					customerId: event.customer_id,
					featureId: event.feature_id,
				})?.balance ?? 0,
			duplicate: result === "duplicate",
		};
	}

	check({
		orgId,
		env,
		customerId,
		featureId,
	}: {
		orgId: string;
		env: string;
		customerId: string;
		featureId: string;
	}): {
		balance: number;
		allowed: boolean;
	} {
		const meter = readFeatureMeter({
			state: this.meterState,
			orgId,
			env,
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
