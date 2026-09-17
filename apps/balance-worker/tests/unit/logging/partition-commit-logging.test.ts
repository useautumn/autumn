import { expect, spyOn, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { createPartitionCommitLogging } from "../../../src/logging/createPartitionCommitLogging.js";
import { MutationBatchNotCommittedError } from "../../../src/processor/writer/writerErrors.js";
import type { DurableMutationRecord } from "../../../src/state/sqliteBalanceStateStore.js";
import {
	closeStoreFixture,
	createOutcome,
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
			outcomes: [createOutcome({ state: createState() })],
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
						info: (...args) => {
							logs.push(args);
						},
						warn: () => {},
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
				workerDeployment: config.deployment,
				workerEndpoint: config.endpoint,
				topic,
				partition,
				phase: "kafka_commit",
				result: "committed",
				batchSize: 1,
				baseOffset: "9007199254740993",
				durationMs: 17.13,
			});
		} finally {
			gate.resolve(result);
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"measures one atomic SQLite batch including initialization, without logging payloads",
	() => {
		const fixture = createStoreFixture();
		const state = createState();
		const initialization: MeteringRecord = {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId: "private_baseline",
			initializedAt: 1_700_000_000_000,
			state,
		};
		const records: DurableMutationRecord[] = [
			{ position: { topic, partition, offset: 0n }, mutation: initialization },
			{
				position: { topic, partition, offset: 1n },
				mutation: createOutcome({ state }),
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
						info: (...args) => {
							logs.push(args);
						},
						warn: () => {},
					},
					monotonicNow: () => now,
				},
				config,
			});
			expect(stateStore.applyDurableMutations({ records })).toHaveLength(2);
			expect(logs).toHaveLength(1);
			expect(logs[0]?.[0]).toMatchObject({
				phase: "sqlite_apply",
				result: "applied",
				batchSize: 2,
				baseOffset: "0",
				durationMs: 0.38,
			});
			expect(stateStore.readState({ identity })?.revision).toBe(1);
			expect(stateStore.readNextOffset({ topic, partition })).toBe(2n);
			expect(stateStore.readState({ identity })).toEqual(
				fixture.store.readState({ identity }),
			);
			expect(JSON.stringify(logs)).not.toContain("private_baseline");
			expect(JSON.stringify(logs)).not.toContain(identity.customerId);
			expect(JSON.stringify(logs)).not.toContain("balanceAfter");
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
							info: () => {},
							warn: (...args) => {
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
						outcomes: [createOutcome({ state: createState() })],
					}),
				).rejects.toBe(cause);
				expect(logs).toHaveLength(1);
				expect(logs[0]?.[0]).toMatchObject({
					phase: "kafka_commit",
					result,
					durationMs: 25,
					baseOffset: null,
					errorName: cause.name,
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
	() => {
		const fixture = createStoreFixture();
		const logs: unknown[][] = [];
		try {
			const { stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
					logger: {
						info: () => {},
						warn: (...args) => {
							logs.push(args);
						},
					},
				},
				config,
			});
			expect(() =>
				stateStore.applyDurableMutations({
					records: [
						{
							position: { topic, partition, offset: 0n },
							mutation: createOutcome({ state: createState() }),
						},
					],
				}),
			).toThrow("Metering state not found");
			expect(logs).toHaveLength(1);
			expect(logs[0]?.[0]).toMatchObject({
				phase: "sqlite_apply",
				result: "failed",
				durationMs: expect.any(Number),
				errorName: "MeteringStateNotFoundError",
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
		const outcome = createOutcome({ state: createState() });
		const cause = new MutationBatchNotCommittedError({
			cause: new Error("aborted"),
		});
		let fail = false;
		function failLog(): never {
			throw new Error("logging unavailable");
		}
		try {
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "baseline",
				state: createState(),
			});
			const { appender, stateStore } = createPartitionCommitLogging({
				ctx: {
					stateStore: fixture.store,
					appender: {
						appendCommitted: async () => {
							if (fail) throw cause;
							return { baseOffset: 0n };
						},
					},
					logger: { info: failLog, warn: failLog },
				},
				config,
			});
			await expect(
				appender.appendCommitted({ topic, partition, outcomes: [outcome] }),
			).resolves.toEqual({ baseOffset: 0n });
			expect(
				stateStore.applyDurableMutations({
					records: [
						{ position: { topic, partition, offset: 0n }, mutation: outcome },
					],
				}),
			).toHaveLength(1);
			expect(stateStore.readState({ identity })?.revision).toBe(1);
			fail = true;
			await expect(
				appender.appendCommitted({ topic, partition, outcomes: [outcome] }),
			).rejects.toBe(cause);
			expect(() =>
				stateStore.applyDurableMutations({
					records: [
						{
							position: { topic, partition, offset: 1n },
							mutation: createOutcome({
								state: {
									...createState(),
									identity: { ...identity, customerId: "missing" },
								},
							}),
						},
					],
				}),
			).toThrow("Metering state not found");
			expect(stateStore.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);
