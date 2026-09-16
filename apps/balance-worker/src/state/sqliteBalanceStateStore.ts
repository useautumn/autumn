import type { Database } from "bun:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
	type CustomerMeteringState,
	executeTrack as executeEngineTrack,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseCustomerMeteringState,
	parseTrackOutcome,
	type TrackOutcome,
} from "@autumn/balance-engine";
import {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
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
	readTrackReceipt,
	updateState,
} from "./sqliteBalanceStateRows.js";
import { openBalanceStateDatabase } from "./sqliteBalanceStateSchema.js";

export {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	UnexpectedKafkaOffsetError,
} from "./sqliteBalanceStateErrors.js";

export type KafkaRecordPosition = {
	topic: string;
	partition: number;
	offset: bigint;
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

	initializeState({ state }: { state: CustomerMeteringState }): void {
		const parsedState = parseCustomerMeteringState({ input: state });
		const persistedState = parseCustomerMeteringState({
			input: JSON.parse(JSON.stringify(parsedState)),
		});
		const partitionKey = meteringPartitionKeyOf({
			identity: persistedState.identity,
		});

		this.database
			.transaction(() => {
				const existingState = readState({
					database: this.database,
					identity: persistedState.identity,
				});
				if (isDeepStrictEqual(existingState, persistedState)) return;
				if (existingState !== null) {
					throw new ConflictingMeteringStateInitializationError({
						partitionKey,
					});
				}

				insertState({
					database: this.database,
					partitionKey,
					state: persistedState,
				});
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
	}: {
		position: KafkaRecordPosition;
		outcome: TrackOutcome;
	}): DurableTrackOutcomeApplyResult {
		assertTopic({ topic: position.topic });
		assertPartition({ partition: position.partition });
		assertOffset({ offset: position.offset });
		const parsedOutcome = parseTrackOutcome({ input: outcome });

		return this.database
			.transaction(() => {
				const expectedOffset = readNextOffset({
					database: this.database,
					topic: position.topic,
					partition: position.partition,
				});
				if (expectedOffset === null) {
					throw new PartitionProgressNotFoundError({
						topic: position.topic,
						partition: position.partition,
					});
				}
				if (position.offset < expectedOffset) {
					return {
						kind: "position_already_applied",
						nextOffset: expectedOffset,
					} as const;
				}
				const partitionKey = meteringPartitionKeyOf({
					identity: parsedOutcome.identity,
				});
				const state = readState({
					database: this.database,
					identity: parsedOutcome.identity,
				});
				if (!state) throw new MeteringStateNotFoundError({ partitionKey });

				const existingReceipt = readTrackReceipt({
					database: this.database,
					identity: parsedOutcome.identity,
					commandId: parsedOutcome.commandId,
				});
				const executed = executeEngineTrack({
					state,
					outcome: parsedOutcome,
					existingReceipt,
				});
				const nextOffset = position.offset + 1n;

				if (executed.kind === "applied") {
					const stateUpdate = updateState({
						database: this.database,
						partitionKey,
						revisionBefore: parsedOutcome.revisionBefore,
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

				return {
					kind: executed.kind,
					state: executed.state,
					receipt: executed.receipt,
					nextOffset,
				} as const;
			})
			.immediate();
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
