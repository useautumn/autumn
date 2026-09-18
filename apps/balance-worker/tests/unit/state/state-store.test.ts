import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	OutOfOrderMutationError,
	StaleMutationError,
	type SubjectState,
} from "@autumn/balance-engine";
import { isPartitionInvariantCause } from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import {
	ConflictingMutationReceiptError,
	ConflictingPartitionInitializationError,
	CorruptBalanceStateError,
	MeteringStatePartitionMismatchError,
} from "../../../src/state/stateStoreErrors.js";
import type { SqliteStateStore } from "../../../src/state/types/stateStore.js";
import {
	applyDurableMutation,
	createInitializeMutation,
	createState,
	createTrackMutation,
	testIdentity as identity,
} from "../../fixtures/mutations.js";

const topic = "metering-events-v1";
const partition = 0;

const createStoreFixture = (): {
	databasePath: string;
	directory: string;
	store: SqliteStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-balance-worker-"));
	const databasePath = join(directory, "balance-state.sqlite");
	const store = openStateStore({ databasePath });

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
	store: SqliteStateStore;
}) => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

/** Seeds the customer the way the log does: one initialize mutation at offset 0. */
const seedCustomer = ({
	store,
	state = createState(),
	offset = 0n,
	commandId = "init_1",
}: {
	store: SqliteStateStore;
	state?: SubjectState;
	offset?: bigint;
	commandId?: string;
}): SubjectState => {
	const mutation = createInitializeMutation({ state, commandId });
	applyDurableMutation({ store, topic, partition, offset, mutation });
	return applyMutation({ state: null, mutation });
};

const balanceOf = ({ state }: { state: SubjectState | null }) =>
	state?.customerEntitlements.find((row) => row.id === "messages_monthly");

describe("state store", () => {
	test.concurrent(
		"initializes a new customer and advances partition progress atomically",
		() => {
			const fixture = createStoreFixture();
			try {
				const mutation = createInitializeMutation({});
				const result = applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 0n,
					mutation,
				});

				expect(result).toMatchObject({ kind: "applied", nextOffset: 1n });
				expect(fixture.store.readState({ identity })).toEqual(
					applyMutation({ state: null, mutation }),
				);
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
				const initialization = createInitializeMutation({});
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 0n,
					mutation: initialization,
				});
				const initialState = applyMutation({
					state: null,
					mutation: initialization,
				});
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation: createTrackMutation({ state: initialState }),
				});

				const result = applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 2n,
					mutation: initialization,
				});

				expect(result).toMatchObject({ kind: "duplicate", nextOffset: 3n });
				expect(fixture.store.readState({ identity })).toMatchObject({
					revision: 2,
				});
				expect(
					balanceOf({ state: fixture.store.readState({ identity }) }),
				).toMatchObject({ balance: 5 });
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"rolls back progress when a mutation id is reused for a different request",
		() => {
			const fixture = createStoreFixture();
			try {
				const initialization = createInitializeMutation({});
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 0n,
					mutation: initialization,
				});
				const stored = fixture.store.readState({ identity });

				expect(() =>
					applyDurableMutation({
						store: fixture.store,
						topic,
						partition,
						offset: 1n,
						mutation: createInitializeMutation({
							state: createState({ balance: 9 }),
						}),
					}),
				).toThrow(ConflictingMutationReceiptError);
				expect(fixture.store.readState({ identity })).toEqual(stored);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("commits state, receipt, and next offset together", () => {
		const fixture = createStoreFixture();
		try {
			const state = seedCustomer({ store: fixture.store });
			const mutation = createTrackMutation({ state });

			const result = applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation,
			});

			expect(result).toMatchObject({ kind: "applied", nextOffset: 2n });
			expect(
				balanceOf({ state: fixture.store.readState({ identity }) }),
			).toMatchObject({ balance: 5 });
			expect(
				fixture.store.readReceipt({ identity, mutationId: mutation.id }),
			).toEqual(mutation);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rejects receipt expiry metadata that disagrees with its mutation",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const mutation = createTrackMutation({ state });
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation,
				});

				const database = new Database(fixture.databasePath, {
					readwrite: true,
				});
				try {
					database.run("UPDATE mutation_receipts SET expires_at = 0");
				} finally {
					database.close();
				}

				expect(() =>
					fixture.store.readReceipt({ identity, mutationId: mutation.id }),
				).toThrow(CorruptBalanceStateError);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("rejects a mutation stored on another partition", () => {
		const fixture = createStoreFixture();
		try {
			const state = seedCustomer({ store: fixture.store });
			fixture.store.initializePartition({
				topic,
				partition: 1,
				nextOffset: 0n,
			});

			expect(() =>
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition: 1,
					offset: 0n,
					mutation: createTrackMutation({ state }),
				}),
			).toThrow(MeteringStatePartitionMismatchError);
			expect(fixture.store.readNextOffset({ topic, partition: 1 })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent("applies a durable mutation batch in one transaction", () => {
		const fixture = createStoreFixture();
		try {
			const state = seedCustomer({ store: fixture.store });
			const firstMutation = createTrackMutation({ state });
			const secondMutation = createTrackMutation({
				state: applyMutation({ state, mutation: firstMutation }),
				commandId: "cmd_2",
			});

			const results = fixture.store.applyDurableMutations({
				records: [
					{
						position: { topic, partition, offset: 1n },
						mutation: firstMutation,
					},
					{
						position: { topic, partition, offset: 2n },
						mutation: secondMutation,
					},
				],
			});

			expect(results.map(({ kind }) => kind)).toEqual(["applied", "applied"]);
			expect(
				balanceOf({ state: fixture.store.readState({ identity }) }),
			).toMatchObject({ balance: 0 });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rolls back the entire batch when a later mutation is out of order",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const firstMutation = createTrackMutation({ state });
				const outOfOrderMutation = createTrackMutation({
					state,
					commandId: "cmd_2",
				});

				expect(() =>
					fixture.store.applyDurableMutations({
						records: [
							{
								position: { topic, partition, offset: 1n },
								mutation: firstMutation,
							},
							{
								position: { topic, partition, offset: 2n },
								mutation: outOfOrderMutation,
							},
						],
					}),
				).toThrow(OutOfOrderMutationError);
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(
					fixture.store.readReceipt({
						identity,
						mutationId: firstMutation.id,
					}),
				).toBeNull();
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"advances past a duplicate mutation without applying it twice",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const mutation = createTrackMutation({ state });

				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation,
				});
				const duplicate = applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 2n,
					mutation,
				});

				expect(duplicate).toMatchObject({ kind: "duplicate", nextOffset: 3n });
				expect(
					balanceOf({ state: fixture.store.readState({ identity }) }),
				).toMatchObject({ balance: 5 });
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
				expect(
					applyDurableMutation({
						store: fixture.store,
						topic,
						partition,
						offset: 2n,
						mutation,
					}),
				).toEqual({ kind: "position_already_applied", nextOffset: 3n });
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"reapplies a receipt the owner pruned and overwrites it",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const firstMutation = createTrackMutation({ state });
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation: firstMutation,
				});
				const advancedState = fixture.store.readState({ identity });
				if (!advancedState) throw new Error("Expected persisted state");
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 2n,
					mutation: createTrackMutation({
						state: advancedState,
						commandId: "cmd_2",
					}),
				});

				// The owner pruned cmd_1 and recomputed it against the newer revision.
				const currentState = fixture.store.readState({ identity });
				if (!currentState) throw new Error("Expected persisted state");
				const replayedMutation = createTrackMutation({ state: currentState });
				expect(replayedMutation.receipt.fingerprint).toBe(
					firstMutation.receipt.fingerprint,
				);

				const result = applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 3n,
					mutation: replayedMutation,
				});

				expect(result).toMatchObject({ kind: "applied", nextOffset: 4n });
				expect(
					fixture.store.readReceipt({
						identity,
						mutationId: replayedMutation.id,
					}),
				).toEqual(replayedMutation);
				expect(fixture.store.readState({ identity })).toMatchObject({
					revision: 4,
				});
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"refuses a mutation whose before values no longer match the stored rows",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation: createTrackMutation({ state }),
				});

				// Same revision as the store, but built from the pre-deduction balance.
				const staleMutation = createTrackMutation({
					state: { ...state, revision: 2 },
					commandId: "cmd_stale",
				});

				let thrown: unknown;
				try {
					applyDurableMutation({
						store: fixture.store,
						topic,
						partition,
						offset: 2n,
						mutation: staleMutation,
					});
				} catch (cause) {
					thrown = cause;
				}

				expect(thrown).toBeInstanceOf(StaleMutationError);
				expect(isPartitionInvariantCause(thrown)).toBe(true);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent(
		"does not advance progress for an out-of-order mutation",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const firstMutation = createTrackMutation({ state });
				const outOfOrderMutation = createTrackMutation({
					state,
					commandId: "cmd_2",
				});

				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation: firstMutation,
				});

				expect(() =>
					applyDurableMutation({
						store: fixture.store,
						topic,
						partition,
						offset: 2n,
						mutation: outOfOrderMutation,
					}),
				).toThrow(OutOfOrderMutationError);
				expect(
					balanceOf({ state: fixture.store.readState({ identity }) }),
				).toMatchObject({ balance: 5 });
				expect(
					fixture.store.readReceipt({
						identity,
						mutationId: outOfOrderMutation.id,
					}),
				).toBeNull();
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("accepts gaps between delivered Kafka offsets", () => {
		const fixture = createStoreFixture();
		try {
			const state = seedCustomer({ store: fixture.store });
			const firstMutation = createTrackMutation({ state });
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation: firstMutation,
			});
			const advancedState = fixture.store.readState({ identity });
			if (!advancedState) throw new Error("Expected persisted metering state");

			const result = applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 4n,
				mutation: createTrackMutation({
					state: advancedState,
					commandId: "cmd_2",
				}),
			});

			expect(result).toMatchObject({ kind: "applied", nextOffset: 5n });
			expect(
				balanceOf({ state: fixture.store.readState({ identity }) }),
			).toMatchObject({ balance: 0 });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(5n);
			expect(
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 2n,
					mutation: firstMutation,
				}),
			).toEqual({ kind: "position_already_applied", nextOffset: 5n });
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"rolls back progress for a conflicting duplicate mutation",
		() => {
			const fixture = createStoreFixture();
			try {
				const state = seedCustomer({ store: fixture.store });
				const mutation = createTrackMutation({ state });
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation,
				});
				const conflicting = createTrackMutation({ state, value: 3 });

				expect(conflicting.id).toBe(mutation.id);
				expect(() =>
					applyDurableMutation({
						store: fixture.store,
						topic,
						partition,
						offset: 2n,
						mutation: conflicting,
					}),
				).toThrow(ConflictingMutationReceiptError);
				expect(
					balanceOf({ state: fixture.store.readState({ identity }) }),
				).toMatchObject({ balance: 5 });
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("folds multiple customers in one partition", () => {
		const fixture = createStoreFixture();
		try {
			const secondIdentity = { ...identity, customerId: "cus_2" };
			const firstState = seedCustomer({ store: fixture.store });
			const secondState = seedCustomer({
				store: fixture.store,
				state: createState({ identity: secondIdentity }),
				offset: 1n,
				commandId: "init_2",
			});

			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 2n,
				mutation: createTrackMutation({ state: firstState }),
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 3n,
				mutation: createTrackMutation({
					state: secondState,
					commandId: "cmd_2",
				}),
			});

			expect(
				balanceOf({ state: fixture.store.readState({ identity }) }),
			).toMatchObject({ balance: 5 });
			expect(
				balanceOf({
					state: fixture.store.readState({ identity: secondIdentity }),
				}),
			).toMatchObject({ balance: 5 });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"refuses to re-initialize a partition at a new offset",
		() => {
			const fixture = createStoreFixture();
			try {
				fixture.store.initializePartition({ topic, partition, nextOffset: 0n });

				expect(() =>
					fixture.store.initializePartition({
						topic,
						partition,
						nextOffset: 1n,
					}),
				).toThrow(ConflictingPartitionInitializationError);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);

	test.concurrent("normalizes negative zero when persisting state", () => {
		const fixture = createStoreFixture();
		try {
			seedCustomer({
				store: fixture.store,
				state: createState({ balance: -0 }),
			});

			expect(
				balanceOf({ state: fixture.store.readState({ identity }) }),
			).toMatchObject({ balance: 0 });
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test.concurrent(
		"restores exact state, receipt, and progress after reopening",
		() => {
			const fixture = createStoreFixture();
			let reopenedStore: SqliteStateStore | null = null;
			try {
				const state = seedCustomer({ store: fixture.store });
				const mutation = createTrackMutation({ state });
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 1n,
					mutation,
				});
				fixture.store.close();

				reopenedStore = openStateStore({
					databasePath: fixture.databasePath,
				});

				expect(
					balanceOf({ state: reopenedStore.readState({ identity }) }),
				).toMatchObject({ balance: 5 });
				expect(
					reopenedStore.readReceipt({ identity, mutationId: mutation.id }),
				).toEqual(mutation);
				expect(reopenedStore.readNextOffset({ topic, partition })).toBe(2n);
			} finally {
				reopenedStore?.close();
				rmSync(fixture.directory, { recursive: true, force: true });
			}
		},
	);
});
