import { expect, spyOn, test } from "bun:test";
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

test.concurrent("keeps the original ports when no logger is supplied", () => {
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
});

test.concurrent(
	"measures the full committed append and preserves large offsets",
	async () => {
		const fixture = createStoreFixture();
		const gate = Promise.withResolvers<{ baseOffset: bigint }>();
		const logs: unknown[][] = [];
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
					logger: {
						debug: (...args) => {
							logs.push(args);
						},
					},
					monotonicNow: () => now,
				},
				config,
			});
			const pending = appender.appendCommitted(params);
			now = 110;
			await Promise.resolve();
			expect(logs).toEqual([]);
			now = 117.125;
			gate.resolve(result);
			await expect(pending).resolves.toBe(result);
			expect(logs).toHaveLength(1);
			expect(logs[0]?.[0]).toEqual({
				event: "balance_worker.commit",
				durationMs: 17.13,
				data: {
					topic,
					partition,
					phase: "kafka_commit",
					result: "committed",
					workerEndpoint: config.endpoint,
					batchSize: 1,
					baseOffset: "9007199254740993",
					errorName: undefined,
				},
			});
		} finally {
			gate.resolve(result);
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"measures one atomic SQLite batch including initialization, without logging payloads",
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
		const logs: unknown[][] = [];
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
					logger: {
						debug: (...args) => {
							logs.push(args);
						},
					},
					monotonicNow: () => now,
				},
				config,
			});
			expect(await stateStore.applyDurableMutations({ records })).toHaveLength(
				2,
			);
			expect(logs).toHaveLength(1);
			expect(logs[0]?.[0]).toMatchObject({
				durationMs: 0.38,
				data: {
					phase: "store_apply",
					result: "applied",
					batchSize: 2,
					baseOffset: "0",
				},
			});
			expect(stateStore.readState({ identity })?.revision).toBe(2);
			expect(stateStore.readNextOffset({ topic, partition })).toBe(2n);
			expect(stateStore.readState({ identity })).toEqual(
				fixture.store.readState({ identity }),
			);
			expect(JSON.stringify(logs)).not.toContain("private_baseline");
			expect(JSON.stringify(logs)).not.toContain(identity.customerId);
			expect(JSON.stringify(logs)).not.toContain("deltas");
		} finally {
			apply.mockRestore();
			closeStoreFixture(fixture);
		}
	},
);

for (const result of ["not_committed", "unknown"] as const) {
	test.concurrent(
		`logs ${result} without changing the append failure`,
		async () => {
			const fixture = createStoreFixture();
			const cause =
				result === "not_committed"
					? new MutationBatchNotCommittedError({
							cause: new Error("private details"),
						})
					: new Error("private details");
			const logs: unknown[][] = [];
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
						logger: {
							debug: (...args) => {
								logs.push(args);
							},
						},
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
				expect(logs).toHaveLength(1);
				expect(logs[0]?.[0]).toMatchObject({
					durationMs: 25,
					data: {
						phase: "kafka_commit",
						result,
						baseOffset: null,
						errorName: cause.name,
					},
				});
				expect(JSON.stringify(logs)).not.toContain("private details");
			} finally {
				closeStoreFixture(fixture);
			}
		},
	);
}

test.concurrent(
	"logs a failed SQLite apply without changing rollback or the error",
	async () => {
		const fixture = createStoreFixture();
		const logs: unknown[][] = [];
		try {
			const { stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
					logger: {
						debug: (...args) => {
							logs.push(args);
						},
					},
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
			expect(logs).toHaveLength(1);
			expect(logs[0]?.[0]).toMatchObject({
				durationMs: expect.any(Number),
				data: {
					phase: "store_apply",
					result: "failed",
					errorName: "SubjectStateMissingError",
				},
			});
			expect(stateStore.readNextOffset({ topic, partition })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"throwing loggers cannot change committed results or original failures",
	async () => {
		const fixture = createStoreFixture();
		const cause = new MutationBatchNotCommittedError({
			cause: new Error("aborted"),
		});
		let fail = false;
		function failLog(): never {
			throw new Error("logging unavailable");
		}
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
					logger: { debug: failLog },
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
