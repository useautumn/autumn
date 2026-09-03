import type { Database } from "bun:sqlite";
import {
	type CustomerMeteringState,
	executeTrack as executeEngineTrack,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseStateInitializedEvent,
	parseTrackOutcome,
	type StateInitializedEvent,
	stateInitializationFingerprintOf,
	type TrackOutcome,
} from "@autumn/balance-engine";
import {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
	MeteringStatePartitionMismatchError,
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "./sqliteBalanceStateErrors.js";
import {
	advancePartitionProgress,
	insertPartitionProgress,
	insertState,
	insertTrackReceipt,
	readNextOffset,
	readState,
	readStoredState,
	readTrackReceipt,
	updateState,
} from "./sqliteBalanceStateRows.js";
import { openBalanceStateDatabase } from "./sqliteBalanceStateSchema.js";

export {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	MeteringStatePartitionMismatchError,
	UnexpectedKafkaOffsetError,
} from "./sqliteBalanceStateErrors.js";

export type KafkaRecordPosition = {
	topic: string;
	partition: number;
	offset: bigint;
};

export type DurableTrackOutcomeRecord = {
	position: KafkaRecordPosition;
	outcome: TrackOutcome;
};

export type DurableStateInitializationRecord = {
	position: KafkaRecordPosition;
	initialization: StateInitializedEvent;
};

export type DurableTrackOutcomeApplyResult =
	| {
			kind: "applied" | "duplicate";
			state: CustomerMeteringState;
			receipt: TrackOutcome;
			nextOffset: bigint;
	  }
	| {
			kind: "position_already_applied";
			nextOffset: bigint;
	  };

export type DurableStateInitializationApplyResult =
	| {
			kind: "initialized" | "duplicate";
			state: CustomerMeteringState;
			nextOffset: bigint;
	  }
	| {
			kind: "position_already_applied";
			nextOffset: bigint;
	  };

const assertTopic = ({ topic }: { topic: string }) => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
};

const assertPartition = ({ partition }: { partition: number }) => {
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
};

const assertOffset = ({ offset }: { offset: bigint }) => {
	if (offset < 0n) throw new RangeError(`Invalid Kafka offset: ${offset}`);
};

export class SqliteBalanceStateStore {
	private readonly database: Database;

	constructor({ database }: { database: Database }) {
		this.database = database;
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
		assertTopic({ topic });
		assertPartition({ partition });
		assertOffset({ offset: nextOffset });

		this.database
			.transaction(() => {
				const existingNextOffset = readNextOffset({
					database: this.database,
					topic,
					partition,
				});
				if (existingNextOffset === nextOffset) return;
				if (existingNextOffset !== null) {
					throw new ConflictingPartitionInitializationError({
						topic,
						partition,
					});
				}

				insertPartitionProgress({
					database: this.database,
					topic,
					partition,
					nextOffset,
				});
			})
			.immediate();
	}

	initializeState({
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
		assertTopic({ topic });
		assertPartition({ partition });
		const persistedInitialization = this.parsePersistedInitialization({
			initialization: {
				schemaVersion: 1,
				type: "state_initialized",
				initializationId,
				initializedAt: 0,
				state,
			},
		});

		this.database
			.transaction(() => {
				this.initializeParsedState({
					topic,
					partition,
					initialization: persistedInitialization,
				});
			})
			.immediate();
	}

	applyDurableStateInitialization({
		position,
		initialization,
	}: DurableStateInitializationRecord): DurableStateInitializationApplyResult {
		assertTopic({ topic: position.topic });
		assertPartition({ partition: position.partition });
		assertOffset({ offset: position.offset });
		const persistedInitialization = this.parsePersistedInitialization({
			initialization,
		});

		return this.database
			.transaction(() => {
				const expectedOffset = this.requireNextOffset({ position });
				if (position.offset < expectedOffset) {
					return {
						kind: "position_already_applied" as const,
						nextOffset: expectedOffset,
					};
				}

				const initialized = this.initializeParsedState({
					topic: position.topic,
					partition: position.partition,
					initialization: persistedInitialization,
				});
				const nextOffset = position.offset + 1n;
				this.advanceProgress({ position, expectedOffset, nextOffset });
				return { ...initialized, nextOffset };
			})
			.immediate();
	}

	readState({
		identity,
	}: {
		identity: MeteringIdentity;
	}): CustomerMeteringState | null {
		return readState({ database: this.database, identity });
	}

	readTrackReceipt({
		identity,
		commandId,
	}: {
		identity: MeteringIdentity;
		commandId: string;
	}): TrackOutcome | null {
		return readTrackReceipt({ database: this.database, identity, commandId });
	}

	readNextOffset({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): bigint | null {
		return readNextOffset({ database: this.database, topic, partition });
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
		const parsedRecords = records.map(({ position, outcome }) => {
			assertTopic({ topic: position.topic });
			assertPartition({ partition: position.partition });
			assertOffset({ offset: position.offset });
			return {
				position,
				outcome: parseTrackOutcome({ input: outcome }),
			};
		});
		if (parsedRecords.length === 0) return [];

		return this.database
			.transaction(() =>
				parsedRecords.map(({ position, outcome }) =>
					this.applyParsedDurableTrackOutcome({ position, outcome }),
				),
			)
			.immediate();
	}

	private applyParsedDurableTrackOutcome({
		position,
		outcome,
	}: DurableTrackOutcomeRecord): DurableTrackOutcomeApplyResult {
		const expectedOffset = this.requireNextOffset({ position });
		if (position.offset < expectedOffset) {
			return {
				kind: "position_already_applied",
				nextOffset: expectedOffset,
			};
		}

		const partitionKey = meteringPartitionKeyOf({ identity: outcome.identity });
		const storedState = readStoredState({
			database: this.database,
			identity: outcome.identity,
		});
		if (!storedState) throw new MeteringStateNotFoundError({ partitionKey });
		if (
			storedState.topic !== position.topic ||
			storedState.partition !== position.partition
		) {
			throw new MeteringStatePartitionMismatchError({ partitionKey });
		}
		const { state } = storedState;

		const existingReceipt = readTrackReceipt({
			database: this.database,
			identity: outcome.identity,
			commandId: outcome.commandId,
		});
		const executed = executeEngineTrack({
			state,
			outcome,
			existingReceipt,
		});
		const nextOffset = position.offset + 1n;

		if (executed.kind === "applied") {
			const stateUpdate = updateState({
				database: this.database,
				partitionKey,
				revisionBefore: outcome.revisionBefore,
				state: executed.state,
			});
			if (stateUpdate.changes !== 1) {
				throw new CorruptBalanceStateError({ partitionKey });
			}

			insertTrackReceipt({
				database: this.database,
				partitionKey,
				position,
				receipt: executed.receipt,
			});
		}

		this.advanceProgress({ position, expectedOffset, nextOffset });

		return {
			kind: executed.kind,
			state: executed.state,
			receipt: executed.receipt,
			nextOffset,
		};
	}

	private parsePersistedInitialization({
		initialization,
	}: {
		initialization: StateInitializedEvent;
	}): StateInitializedEvent {
		const parsedInitialization = parseStateInitializedEvent({
			input: initialization,
		});
		return parseStateInitializedEvent({
			input: JSON.parse(JSON.stringify(parsedInitialization)),
		});
	}

	private initializeParsedState({
		topic,
		partition,
		initialization,
	}: {
		topic: string;
		partition: number;
		initialization: StateInitializedEvent;
	}): {
		kind: "initialized" | "duplicate";
		state: CustomerMeteringState;
	} {
		const partitionKey = meteringPartitionKeyOf({
			identity: initialization.state.identity,
		});
		const initializationFingerprint = stateInitializationFingerprintOf({
			initialization,
		});
		const existing = readStoredState({
			database: this.database,
			identity: initialization.state.identity,
		});
		if (existing) {
			if (
				existing.topic === topic &&
				existing.partition === partition &&
				existing.initializationId === initialization.initializationId &&
				existing.initializationFingerprint === initializationFingerprint
			) {
				return { kind: "duplicate", state: existing.state };
			}
			throw new ConflictingMeteringStateInitializationError({ partitionKey });
		}

		insertState({
			database: this.database,
			partitionKey,
			topic,
			partition,
			initializationId: initialization.initializationId,
			initializationFingerprint,
			state: initialization.state,
		});
		return { kind: "initialized", state: initialization.state };
	}

	private requireNextOffset({
		position,
	}: {
		position: KafkaRecordPosition;
	}): bigint {
		const expectedOffset = readNextOffset({
			database: this.database,
			topic: position.topic,
			partition: position.partition,
		});
		if (expectedOffset !== null) return expectedOffset;
		throw new PartitionProgressNotFoundError({
			topic: position.topic,
			partition: position.partition,
		});
	}

	private advanceProgress({
		position,
		expectedOffset,
		nextOffset,
	}: {
		position: KafkaRecordPosition;
		expectedOffset: bigint;
		nextOffset: bigint;
	}): void {
		const progressUpdate = advancePartitionProgress({
			database: this.database,
			topic: position.topic,
			partition: position.partition,
			expectedOffset,
			nextOffset,
		});
		if (progressUpdate.changes !== 1) {
			throw new UnexpectedKafkaOffsetError({
				topic: position.topic,
				partition: position.partition,
				expectedOffset,
				receivedOffset: position.offset,
			});
		}
	}

	close(): void {
		this.database.close(true);
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
