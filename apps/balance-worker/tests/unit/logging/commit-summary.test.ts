import { expect, test } from "bun:test";
import { overrideVariant } from "../../../src/experiments/variant.js";
import {
	COMMIT_SUMMARY_INTERVAL_MS,
	createPartitionCommitLogging,
} from "../../../src/logging/createPartitionCommitLogging.js";
import { MutationBatchNotCommittedError } from "../../../src/processor/writer/writerErrors.js";
import type { DurableMutationRecord } from "../../../src/state/types/durableMutation.js";
import {
	closeStoreFixture,
	createMutation,
	createState,
	createStoreFixture,
	partition,
	topic,
} from "../kafka/kafka-test-fixtures.js";

const config = { deployment: "staging", endpoint: "http://worker.test" };

test("D: successful commits and applies become one summary per partition; failures keep their own line", async () => {
	const fixture = createStoreFixture();
	const debug: unknown[][] = [];
	const info: unknown[][] = [];
	const timers: { delayMs: number; run(): void }[] = [];
	let now = 0;
	let failNext = false;
	overrideVariant(() => "D");
	try {
		const { appender, stateStore } = createPartitionCommitLogging({
			ctx: {
				stateStore: {
					...fixture.store,
					applyDurableMutations: async ({ records }) => {
						now += 40;
						return records.map(() => ({ kind: "applied" }) as never);
					},
				},
				appender: {
					appendCommitted: async () => {
						now += 4;
						if (failNext)
							throw new MutationBatchNotCommittedError({ cause: null });
						return { baseOffset: 0n };
					},
				},
				logger: {
					debug: (...args) => debug.push(args),
					info: (...args) => info.push(args),
				},
				monotonicNow: () => now,
				scheduleSummary: (timer) => timers.push(timer),
			},
			config,
		});
		const outcomes = [createMutation({ state: createState() })];
		for (let index = 0; index < 3; index++)
			await appender.appendCommitted({
				topic,
				partition,
				outcomes: [...outcomes, ...outcomes],
				waits: { queuedMs: 1, lingerMs: 5, storeWaitMs: 2 },
			});
		await stateStore.applyDurableMutations({
			records: [
				{ position: { topic, partition, offset: 0n } },
			] as unknown as DurableMutationRecord[],
		});
		failNext = true;
		await expect(
			appender.appendCommitted({ topic, partition, outcomes }),
		).rejects.toThrow();

		// Only the failure was written as it happened.
		expect(debug).toHaveLength(1);
		expect(debug[0]?.[0]).toMatchObject({
			event: "balance_worker.commit",
			data: { result: "not_committed" },
		});
		expect(timers).toHaveLength(1);
		expect(timers[0]?.delayMs).toBe(COMMIT_SUMMARY_INTERVAL_MS);
		timers[0]?.run();
		expect(info).toHaveLength(1);
		expect(info[0]?.[0]).toEqual({
			event: "balance_worker.commit_summary",
			data: {
				topic,
				partition,
				workerEndpoint: config.endpoint,
				windowMs: 52,
				kafka_commit: {
					count: 3,
					records: 6,
					totalMs: 12,
					maxMs: 4,
					lingerMs: 15,
					storeWaitMs: 6,
				},
				store_apply: {
					count: 1,
					records: 1,
					totalMs: 40,
					maxMs: 40,
					lingerMs: 0,
					storeWaitMs: 0,
				},
			},
		});
		// Nothing counted since: the next interval starts with the next commit.
		timers[0]?.run();
		expect(info).toHaveLength(1);
	} finally {
		overrideVariant(null);
		closeStoreFixture(fixture);
	}
});

test("A: every commit keeps its own line and nothing is summarised", async () => {
	const fixture = createStoreFixture();
	const debug: unknown[][] = [];
	const timers: unknown[] = [];
	try {
		const { appender } = createPartitionCommitLogging({
			ctx: {
				stateStore: fixture.store,
				appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
				logger: { debug: (...args) => debug.push(args) },
				scheduleSummary: (timer) => timers.push(timer),
			},
			config,
		});
		for (let index = 0; index < 2; index++)
			await appender.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			});
		expect(debug).toHaveLength(2);
		expect(timers).toEqual([]);
	} finally {
		closeStoreFixture(fixture);
	}
});
