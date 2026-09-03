import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ConflictingTrackReceiptError,
	type CustomerMeteringState,
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	type MeteringIdentity,
	OutOfOrderTrackOutcomeError,
	parseTrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../../src/state/sqliteBalanceStateErrors.js";
import {
	ConflictingMeteringStateInitializationError,
	ConflictingPartitionInitializationError,
	MeteringStatePartitionMismatchError,
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const topic = "metering-events-v1";
const partition = 0;

const createState = ({
	balance = 10,
	meteringIdentity = identity,
}: {
	balance?: number;
	meteringIdentity?: MeteringIdentity;
} = {}) =>
	createCustomerMeteringState({
		identity: meteringIdentity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

const createOutcome = ({
	state,
	commandId = "cmd_1",
	requestId = "req_1",
}: {
	state: CustomerMeteringState;
	commandId?: string;
	requestId?: string;
}): TrackOutcome => {
	const decision = computeTrack({
		state,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId,
				identity: state.identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
				deduplicationExpiresAt: 1_700_086_400_000,
			},
		}),
	});

	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

const createStoreFixture = (): {
	databasePath: string;
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-balance-worker-"));
	const databasePath = join(directory, "balance-state.sqlite");
	const store = openSqliteBalanceStateStore({ databasePath });

	try {
		store.initializePartition({ topic, partition, nextOffset: 0n });
		return { databasePath, directory, store };
	} catch (error) {
		store.close();
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
};

const closeStoreFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}) => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

describe("SQLite balance state store", () => {
	test.concurrent(
		"initializes a new customer and advances partition progress atomically",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				const result = fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: 0n },
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId: "init_1",
						initializedAt: 1_700_000_000_000,
						state,
					},
				});

				expect(result).toMatchObject({ kind: "initialized", nextOffset: 1n });
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"does not reset mutated state when the same initialization is delivered again",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				const initialization = {
					schemaVersion: 1,
					type: "state_initialized",
					initializationId: "init_1",
					initializedAt: 1_700_000_000_000,
					state,
				} as const;
				fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: 0n },
					initialization,
				});
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 1n },
					outcome: createOutcome({ state }),
				});

				const result = fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: 2n },
					initialization: {
						...initialization,
						initializedAt: initialization.initializedAt + 1,
					},
				});

				expect(result).toMatchObject({ kind: "duplicate", nextOffset: 3n });
				expect(fixture.store.readState({ identity })).toMatchObject({
					revision: 1,
					featureStatesById: {
						messages: {
							customerEntitlements: [{ balance: 5, usage: 5 }],
						},
					},
				});
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"rolls back progress when an initialization id is reused for different state",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: 0n },
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId: "init_1",
						initializedAt: 1_700_000_000_000,
						state,
					},
				});

				expect(() =>
					fixture.store.applyDurableStateInitialization({
						position: { topic, partition, offset: 1n },
						initialization: {
							schemaVersion: 1,
							type: "state_initialized",
							initializationId: "init_1",
							initializedAt: 1_700_000_000_001,
							state: createState({ balance: 9 }),
						},
					}),
				).toThrow(ConflictingMeteringStateInitializationError);
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("commits state, receipt, and next offset together", () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const outcome = createOutcome({ state });

			const result = fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome,
			});

			expect(result).toMatchObject({ kind: "applied", nextOffset: 1n });
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5, usage: 5 }],
					},
				},
			});
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: outcome.commandId,
				}),
			).toEqual(outcome);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rejects receipt expiry metadata that disagrees with its outcome",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				const outcome = createOutcome({ state });
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 0n },
					outcome,
				});

				const database = new Database(fixture.databasePath, {
					readwrite: true,
				});
				try {
					database.run(
						"UPDATE track_receipts SET deduplication_expires_at = 0",
					);
				} finally {
					database.close();
				}

				expect(() =>
					fixture.store.readTrackReceipt({
						identity,
						commandId: outcome.commandId,
					}),
				).toThrow(CorruptBalanceStateError);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("rejects an outcome stored on another partition", () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializePartition({
				topic,
				partition: 1,
				nextOffset: 0n,
			});
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});

			expect(() =>
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition: 1, offset: 0n },
					outcome: createOutcome({ state }),
				}),
			).toThrow(MeteringStatePartitionMismatchError);
			expect(fixture.store.readNextOffset({ topic, partition: 1 })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent("applies a durable outcome batch in one transaction", () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const firstOutcome = createOutcome({ state });
			const projectedState = executeTrack({
				state,
				outcome: firstOutcome,
			}).state;
			const secondOutcome = createOutcome({
				state: projectedState,
				commandId: "cmd_2",
				requestId: "req_2",
			});

			const results = fixture.store.applyDurableTrackOutcomes({
				records: [
					{
						position: { topic, partition, offset: 0n },
						outcome: firstOutcome,
					},
					{
						position: { topic, partition, offset: 1n },
						outcome: secondOutcome,
					},
				],
			});

			expect(results.map(({ kind }) => kind)).toEqual(["applied", "applied"]);
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 2,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 0, usage: 10 }],
					},
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rolls back the entire outcome batch when a later outcome fails",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				const firstOutcome = createOutcome({ state });
				const staleOutcome = createOutcome({
					state,
					commandId: "cmd_2",
					requestId: "req_2",
				});

				expect(() =>
					fixture.store.applyDurableTrackOutcomes({
						records: [
							{
								position: { topic, partition, offset: 0n },
								outcome: firstOutcome,
							},
							{
								position: { topic, partition, offset: 1n },
								outcome: staleOutcome,
							},
						],
					}),
				).toThrow(OutOfOrderTrackOutcomeError);
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(
					fixture.store.readTrackReceipt({
						identity,
						commandId: firstOutcome.commandId,
					}),
				).toBeNull();
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"advances past a duplicate outcome without applying it twice",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				const outcome = createOutcome({ state });

				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 0n },
					outcome,
				});
				const duplicate = fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 1n },
					outcome,
				});

				expect(duplicate).toMatchObject({ kind: "duplicate", nextOffset: 2n });
				expect(fixture.store.readState({ identity })).toMatchObject({
					revision: 1,
					featureStatesById: {
						messages: {
							customerEntitlements: [{ balance: 5, usage: 5 }],
						},
					},
				});
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);

				expect(
					fixture.store.applyDurableTrackOutcome({
						position: { topic, partition, offset: 1n },
						outcome,
					}),
				).toEqual({ kind: "position_already_applied", nextOffset: 2n });
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("does not advance progress for a stale outcome", () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const firstOutcome = createOutcome({ state });
			const staleOutcome = createOutcome({
				state,
				commandId: "cmd_2",
				requestId: "req_2",
			});

			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: firstOutcome,
			});

			expect(() =>
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 1n },
					outcome: staleOutcome,
				}),
			).toThrow(OutOfOrderTrackOutcomeError);
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5, usage: 5 }],
					},
				},
			});
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: staleOutcome.commandId,
				}),
			).toBeNull();
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent("accepts gaps between delivered Kafka offsets", () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const firstOutcome = createOutcome({ state });
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: firstOutcome,
			});
			const advancedState = fixture.store.readState({ identity });
			if (!advancedState) throw new Error("Expected persisted metering state");
			const secondOutcome = createOutcome({
				state: advancedState,
				commandId: "cmd_2",
				requestId: "req_2",
			});

			const result = fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 3n },
				outcome: secondOutcome,
			});

			expect(result).toMatchObject({ kind: "applied", nextOffset: 4n });
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 2,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 0, usage: 10 }],
					},
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
			expect(
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 1n },
					outcome: firstOutcome,
				}),
			).toEqual({ kind: "position_already_applied", nextOffset: 4n });
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rolls back progress for a conflicting duplicate outcome",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				const outcome = createOutcome({ state });
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 0n },
					outcome,
				});

				expect(() =>
					fixture.store.applyDurableTrackOutcome({
						position: { topic, partition, offset: 1n },
						outcome: { ...outcome, requestId: "req_conflict" },
					}),
				).toThrow(ConflictingTrackReceiptError);
				expect(fixture.store.readState({ identity })).toMatchObject({
					revision: 1,
					featureStatesById: {
						messages: {
							customerEntitlements: [{ balance: 5, usage: 5 }],
						},
					},
				});
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("folds multiple customers in one partition", () => {
		const fixture = createStoreFixture();
		try {
			const secondIdentity = { ...identity, customerId: "cus_2" };
			const firstState = createState();
			const secondState = createState({ meteringIdentity: secondIdentity });
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state: firstState,
			});
			fixture.store.initializeState({
				topic,
				partition,
				initializationId: "init_1",
				state: secondState,
			});

			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: createOutcome({ state: firstState }),
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 1n },
				outcome: createOutcome({
					state: secondState,
					commandId: "cmd_2",
					requestId: "req_2",
				}),
			});

			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: { customerEntitlements: [{ balance: 5, usage: 5 }] },
				},
			});
			expect(
				fixture.store.readState({ identity: secondIdentity }),
			).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: { customerEntitlements: [{ balance: 5, usage: 5 }] },
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"allows exact initialization retries without replacing persisted data",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState();
				fixture.store.initializePartition({ topic, partition, nextOffset: 0n });
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});

				expect(() =>
					fixture.store.initializePartition({
						topic,
						partition,
						nextOffset: 1n,
					}),
				).toThrow(ConflictingPartitionInitializationError);
				expect(() =>
					fixture.store.initializeState({
						topic,
						partition,
						initializationId: "init_1",
						state: createState({ balance: 9 }),
					}),
				).toThrow(ConflictingMeteringStateInitializationError);
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"normalizes negative zero across initialization retries",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = createState({ balance: -0 });
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});

				expect(fixture.store.readState({ identity })).toMatchObject({
					featureStatesById: {
						messages: { customerEntitlements: [{ balance: 0 }] },
					},
				});
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"restores exact state, receipt, and progress after reopening",
		() => {
			const fixture = createStoreFixture();
			let reopenedStore: SqliteBalanceStateStore | null = null;
			try {
				const state = createState();
				fixture.store.initializeState({
					topic,
					partition,
					initializationId: "init_1",
					state,
				});
				const outcome = createOutcome({ state });
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 0n },
					outcome,
				});
				fixture.store.close();

				reopenedStore = openSqliteBalanceStateStore({
					databasePath: fixture.databasePath,
				});

				expect(reopenedStore.readState({ identity })).toMatchObject({
					revision: 1,
					featureStatesById: {
						messages: {
							customerEntitlements: [{ balance: 5, usage: 5 }],
						},
					},
				});
				expect(
					reopenedStore.readTrackReceipt({
						identity,
						commandId: outcome.commandId,
					}),
				).toEqual(outcome);
				expect(reopenedStore.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				reopenedStore?.close();
				rmSync(fixture.directory, { recursive: true, force: true });
			}
		},
	);
});
