import { expect, spyOn, test } from "bun:test";
import {
	type CommitSummaries,
	createCommitSummaries,
} from "../../../src/logging/commitSummaries.js";
import { createPartitionCommitLogging } from "../../../src/logging/createPartitionCommitLogging.js";
import { MutationBatchNotCommittedError } from "../../../src/processor/writer/writerErrors.js";
import type { DurableMutationRecord } from "../../../src/state/types/durableMutation.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeMutation,
	createTrackMutation,
	seedSubjectState,
} from "../../fixtures/mutations.js";
import {
	closeStoreFixture,
	createMutation,
	createState,
	createStoreFixture,
	identity,
	partition,
	topic,
} from "../kafka/kafka-test-fixtures.js";

const config = { deployment: "staging", endpoint: "http://worker.test" };

test.concurrent(
	"keeps the original ports when no logger or summaries are supplied",
	() => {
		const fixture = createStoreFixture();
		const appender = { appendCommitted: async () => ({ baseOffset: 0n }) };
		try {
			const logging = createPartitionCommitLogging({
				ctx: { appender, stateStore: fixture.store },
				config,
			});
			expect(logging.appender).toBe(appender);
			expect(logging.stateStore).toBe(fixture.store);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"a summarized store still claims the partition through the store it wraps",
	async () => {
		const fixture = createStoreFixture();
		const claimed: unknown[] = [];
		try {
			const { stateStore } = createPartitionCommitLogging({
				ctx: {
					appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
					stateStore: {
						...fixture.store,
						claimPartition: async (position) => {
							claimed.push(position);
						},
					},
					summaries: createCommitSummaries(),
				},
				config,
			});
			await stateStore.claimPartition?.({ topic, partition });
			expect(claimed).toEqual([{ topic, partition }]);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"a committed append adds its full duration and records to its partition's window, and keeps large offsets",
	async () => {
		const fixture = createStoreFixture();
		const gate = Promise.withResolvers<{ baseOffset: bigint }>();
		const summaries = createCommitSummaries();
		let now = 100;
		const params = {
			topic,
			partition,
			outcomes: [createMutation({ state: createState() })],
		};
		const result = { baseOffset: 9007199254740993n };
		try {
			const { appender } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: {
						appendCommitted: (received) => {
							expect(received).toBe(params);
							return gate.promise;
						},
					},
					summaries,
					monotonicNow: () => now,
				},
				config,
			});
			const pending = appender.appendCommitted(params);
			now = 117.125;
			gate.resolve(result);
			await expect(pending).resolves.toBe(result);
			expect(summaries.drain()).toEqual({
				[String(partition)]: {
					commits: 1,
					records: 1,
					notCommitted: 0,
					unknown: 0,
					commitMs: { totalMs: 17.13, maxMs: 17.13 },
					lingerMs: { totalMs: 0, maxMs: 0 },
					storeWaitMs: { totalMs: 0, maxMs: 0 },
					applies: 0,
					applyFailed: 0,
					applyMs: { totalMs: 0, maxMs: 0 },
				},
			});
			expect(summaries.drain()).toEqual({});
		} finally {
			gate.resolve(result);
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"a window sums how long its batches waited before their commits started",
	async () => {
		const fixture = createStoreFixture();
		const summaries = createCommitSummaries();
		try {
			const { appender } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: { appendCommitted: async () => ({ baseOffset: 4n }) },
					summaries,
					monotonicNow: () => 0,
				},
				config,
			});
			for (const waits of [
				{ queuedMs: 12.3456, lingerMs: 5.001, storeWaitMs: 0 },
				{ queuedMs: null, lingerMs: 1, storeWaitMs: 3.5 },
			])
				await appender.appendCommitted({
					topic,
					partition,
					outcomes: [createMutation({ state: createState() })],
					waits,
				});
			expect(summaries.drain()[String(partition)]).toMatchObject({
				commits: 2,
				lingerMs: { totalMs: 6, maxMs: 5 },
				storeWaitMs: { totalMs: 3.5, maxMs: 3.5 },
			});
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"one atomic SQLite batch, initialization included, is summed as one apply without any payload",
	async () => {
		const fixture = createStoreFixture();
		const state = createState();
		const initialization = createInitializeMutation({
			state,
			commandId: "private_baseline",
		});
		const records: DurableMutationRecord[] = [
			{ position: { topic, partition, offset: 0n }, mutation: initialization },
			{
				position: { topic, partition, offset: 1n },
				mutation: createTrackMutation({
					state: { ...state, revision: 1 },
				}),
			},
		];
		const summaries = createCommitSummaries();
		let now = 0;
		const originalApply = fixture.store.applyDurableMutations.bind(
			fixture.store,
		);
		const apply = spyOn(
			fixture.store,
			"applyDurableMutations",
		).mockImplementation((params) => {
			const result = originalApply(params);
			now += 0.375;
			return result;
		});
		try {
			const { stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
					summaries,
					monotonicNow: () => now,
				},
				config,
			});
			expect(await stateStore.applyDurableMutations({ records })).toHaveLength(
				2,
			);
			const window = summaries.drain();
			expect(window[String(partition)]).toMatchObject({
				applies: 1,
				applyFailed: 0,
				applyMs: { totalMs: 0.38, maxMs: 0.38 },
			});
			expect(stateStore.readState({ identity })?.revision).toBe(2);
			expect(stateStore.readNextOffset({ topic, partition })).toBe(2n);
			expect(stateStore.readState({ identity })).toEqual(
				fixture.store.readState({ identity }),
			);
			expect(JSON.stringify(window)).not.toContain("private_baseline");
			expect(JSON.stringify(window)).not.toContain(identity.customerId);
		} finally {
			apply.mockRestore();
			closeStoreFixture(fixture);
		}
	},
);

for (const result of ["not_committed", "unknown"] as const) {
	test.concurrent(
		`counts ${result} without changing the append failure`,
		async () => {
			const fixture = createStoreFixture();
			const cause =
				result === "not_committed"
					? new MutationBatchNotCommittedError({
							cause: new Error("private details"),
						})
					: new Error("private details");
			const summaries = createCommitSummaries();
			let now = 0;
			try {
				const { appender } = createPartitionCommitLogging({
					ctx: {
						stateStore: fixture.store,
						appender: {
							appendCommitted: async () => {
								now = 25;
								throw cause;
							},
						},
						summaries,
						monotonicNow: () => now,
					},
					config,
				});
				await expect(
					appender.appendCommitted({
						topic,
						partition,
						outcomes: [createMutation({ state: createState() })],
					}),
				).rejects.toBe(cause);
				expect(summaries.drain()[String(partition)]).toMatchObject({
					commits: 1,
					notCommitted: result === "not_committed" ? 1 : 0,
					unknown: result === "unknown" ? 1 : 0,
					commitMs: { totalMs: 25, maxMs: 25 },
				});
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);
}

test.concurrent(
	"counts a failed SQLite apply without changing rollback or the error",
	async () => {
		const fixture = createStoreFixture();
		const summaries = createCommitSummaries();
		try {
			const { stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
					summaries,
				},
				config,
			});
			await expect(
				stateStore.applyDurableMutations({
					records: [
						{
							position: { topic, partition, offset: 0n },
							mutation: createMutation({ state: createState() }),
						},
					],
				}),
			).rejects.toThrow("Only an initialize can create subject state");
			expect(summaries.drain()[String(partition)]).toMatchObject({
				applies: 1,
				applyFailed: 1,
			});
			expect(stateStore.readNextOffset({ topic, partition })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"throwing summaries cannot change committed results or original failures",
	async () => {
		const fixture = createStoreFixture();
		const cause = new MutationBatchNotCommittedError({
			cause: new Error("aborted"),
		});
		let fail = false;
		function failSummary(): never {
			throw new Error("telemetry unavailable");
		}
		const summaries: CommitSummaries = {
			committed: failSummary,
			applied: failSummary,
			drain: failSummary,
		};
		try {
			const seededState = seedSubjectState({
				store: fixture.store,
				topic,
				partition,
				state: createState(),
				commandId: "baseline",
			});
			const mutation = createTrackMutation({ state: seededState });
			const { appender, stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: {
						appendCommitted: async () => {
							if (fail) throw cause;
							return { baseOffset: 0n };
						},
					},
					summaries,
				},
				config,
			});
			await expect(
				appender.appendCommitted({ topic, partition, outcomes: [mutation] }),
			).resolves.toEqual({ baseOffset: 0n });
			expect(
				await stateStore.applyDurableMutations({
					records: [{ position: { topic, partition, offset: 1n }, mutation }],
				}),
			).toHaveLength(1);
			expect(stateStore.readState({ identity })?.revision).toBe(2);
			fail = true;
			await expect(
				appender.appendCommitted({ topic, partition, outcomes: [mutation] }),
			).rejects.toBe(cause);
			await expect(
				stateStore.applyDurableMutations({
					records: [
						{
							position: { topic, partition, offset: 2n },
							mutation: createMutation({
								state: createState({
									identity: { ...identity, customerId: "missing" },
								}),
							}),
						},
					],
				}),
			).rejects.toThrow("Only an initialize can create subject state");
			expect(stateStore.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);
