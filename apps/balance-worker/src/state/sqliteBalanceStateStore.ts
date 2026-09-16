import type { Database } from "bun:sqlite";
import type {
	CustomerMeteringState,
	MeteringIdentity,
	TrackOutcome,
} from "@autumn/balance-engine";
import type {
	PartitionCheckpointPartitionResolver,
	PartitionCheckpointV1,
	PreparedPartitionCheckpoint,
} from "../checkpoint/partitionCheckpoint.js";
import { applyDurableMutations } from "./actions/applyDurableMutations/applyDurableMutations.js";
import {
	stateInitializationApplyResultOf,
	trackOutcomeApplyResultOf,
} from "./actions/applyDurableMutations/legacyApplyResults.js";
import {
	capturePartitionCheckpoint,
	type PartitionCheckpointCaptureLimits,
} from "./actions/checkpoint/capturePartitionCheckpoint.js";
import {
	type PartitionCheckpointRestoreLimits,
	type PartitionCheckpointRestoreMode,
	restorePartitionCheckpoint,
} from "./actions/checkpoint/restorePartitionCheckpoint.js";
import { initializePartition } from "./actions/initializePartition.js";
import { pruneExpiredTrackReceipts } from "./actions/pruneExpiredTrackReceipts.js";
import { restoreState } from "./actions/restoreState.js";
import { assertPartition, assertTopic } from "./assertKafkaPosition.js";
import { openBalanceStateDatabase } from "./openBalanceStateDatabase.js";
import { readStoredState } from "./repos/customerStates/customerStates.js";
import { readNextOffset } from "./repos/partitionProgress.js";
import { readTrackReceipt } from "./repos/trackReceipts/trackReceipts.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
	DurableStateInitializationApplyResult,
	DurableStateInitializationRecord,
	DurableTrackOutcomeApplyResult,
	DurableTrackOutcomeRecord,
} from "./types/durableMutation.js";
import type { StateStoreContext } from "./types/stateStoreContext.js";

export {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	MeteringStatePartitionMismatchError,
	UnexpectedKafkaOffsetError,
} from "./sqliteBalanceStateErrors.js";
export type {
	AppliedDurableMutation,
	DurableMutationApplyResult,
	DurableMutationRecord,
	DurableStateInitializationApplyResult,
	DurableStateInitializationRecord,
	DurableTrackOutcomeApplyResult,
	DurableTrackOutcomeRecord,
} from "./types/durableMutation.js";
export type { KafkaRecordPosition } from "./types/kafkaRecordPosition.js";

export class SqliteBalanceStateStore {
	private readonly ctx: StateStoreContext;

	constructor({ database }: { database: Database }) {
		this.ctx = { sqliteDb: database };
	}

	initializePartition({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void {
		initializePartition({ ctx: this.ctx, topic, partition, nextOffset });
	}

	restorePartitionCheckpoint({
		checkpoint,
		mode,
		limits,
		partitionResolver,
	}: {
		checkpoint: PartitionCheckpointV1;
		mode: PartitionCheckpointRestoreMode;
		limits: PartitionCheckpointRestoreLimits;
		partitionResolver: PartitionCheckpointPartitionResolver;
	}): void {
		restorePartitionCheckpoint({
			ctx: this.ctx,
			checkpoint,
			mode,
			limits,
			partitionResolver,
		});
	}

	capturePartitionCheckpoint({
		topic,
		partition,
		createdAt,
		limits,
		consumedNextOffset,
	}: {
		topic: string;
		partition: number;
		createdAt: number;
		limits: PartitionCheckpointCaptureLimits;
		consumedNextOffset?: bigint | null;
	}): PreparedPartitionCheckpoint {
		assertTopic({ topic });
		assertPartition({ partition });
		return capturePartitionCheckpoint({
			ctx: this.ctx,
			topic,
			partition,
			createdAt,
			limits,
			consumedNextOffset,
		});
	}

	pruneExpiredTrackReceipts({
		topic,
		partition,
		expiresAtOrBefore,
		limit,
	}: {
		topic: string;
		partition: number;
		expiresAtOrBefore: number;
		limit: number;
	}): { deletedCount: number } {
		assertTopic({ topic });
		assertPartition({ partition });
		return pruneExpiredTrackReceipts({
			ctx: this.ctx,
			topic,
			partition,
			expiresAtOrBefore,
			limit,
		});
	}

	restoreState({
		topic,
		partition,
		initializationId,
		state,
	}: {
		topic: string;
		partition: number;
		initializationId: string;
		state: CustomerMeteringState;
	}): void {
		restoreState({ ctx: this.ctx, topic, partition, initializationId, state });
	}

	readState({
		identity,
	}: {
		identity: MeteringIdentity;
	}): CustomerMeteringState | null {
		return readStoredState({ ctx: this.ctx, identity })?.state ?? null;
	}

	readInitializationReceipt({ identity }: { identity: MeteringIdentity }): {
		initializationId: string;
		initializationFingerprint: string;
	} | null {
		const storedState = readStoredState({ ctx: this.ctx, identity });
		if (!storedState) return null;
		return {
			initializationId: storedState.initializationId,
			initializationFingerprint: storedState.initializationFingerprint,
		};
	}

	readTrackReceipt({
		identity,
		commandId,
	}: {
		identity: MeteringIdentity;
		commandId: string;
	}): TrackOutcome | null {
		return readTrackReceipt({ ctx: this.ctx, identity, commandId });
	}

	readNextOffset({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): bigint | null {
		return readNextOffset({ ctx: this.ctx, topic, partition });
	}

	applyDurableStateInitialization({
		position,
		initialization,
	}: DurableStateInitializationRecord): DurableStateInitializationApplyResult {
		const [result] = this.applyDurableMutations({
			records: [{ position, mutation: initialization }],
		});
		if (!result) throw new Error("Expected a durable mutation result");
		return stateInitializationApplyResultOf({ result });
	}

	applyDurableTrackOutcome({
		position,
		outcome,
	}: DurableTrackOutcomeRecord): DurableTrackOutcomeApplyResult {
		const [result] = this.applyDurableTrackOutcomes({
			records: [{ position, outcome }],
		});
		if (!result) throw new Error("Expected a durable track outcome result");
		return result;
	}

	applyDurableTrackOutcomes({
		records,
	}: {
		records: readonly DurableTrackOutcomeRecord[];
	}): DurableTrackOutcomeApplyResult[] {
		return this.applyDurableMutations({
			records: records.map(({ position, outcome }) => ({
				position,
				mutation: outcome,
			})),
		}).map((result) => trackOutcomeApplyResultOf({ result }));
	}

	applyDurableMutations({
		records,
	}: {
		records: readonly DurableMutationRecord[];
	}): DurableMutationApplyResult[] {
		return applyDurableMutations({ ctx: this.ctx, records });
	}

	close(): void {
		this.ctx.sqliteDb.close(true);
	}
}

export const openSqliteBalanceStateStore = ({
	databasePath,
}: {
	databasePath: string;
}): SqliteBalanceStateStore =>
	new SqliteBalanceStateStore({
		database: openBalanceStateDatabase({ databasePath }),
	});
