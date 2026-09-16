/**
 * The operator composes with the real coordinator, client, worker and state
 * store: a cold baseline of 72 accepts track 5 and reports a public remaining
 * of 67, replaying the same archived request charges once, and a request that
 * exceeds the balance completes as a business rejection whose public error
 * reply carries the code but no balance.
 */
import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import type {
	ReplayOperation,
	ReplayRequestBody,
} from "@/internal/balances/replay/manifest/replayManifestContracts.js";
import { executeReplayRequest } from "@/internal/balances/replay/operator/executeReplayRequest.js";
import { openSqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";
import {
	createWorkerFixture,
	partition,
	topic,
} from "../balanceWorker/worker-fixture.js";
import {
	buildReplayRequest,
	createArchiveRecord,
	findReplyValue,
	type ReplayArchiveRecord,
	replayEnvOf,
} from "./operator-fixture.js";
import {
	createLoadedSource,
	createReplayHydrationFixture,
} from "./replay-hydration-fixture.js";

type ReplayExecutionResult = Awaited<ReturnType<typeof executeReplayRequest>>;

function expectCompletedReply({ result }: { result: ReplayExecutionResult }) {
	if (result.kind !== "completed")
		throw new Error(`expected completion, received ${JSON.stringify(result)}`);
	return result.reply;
}

function remainingOf({ result }: { result: ReplayExecutionResult }) {
	return findReplyValue({
		reply: expectCompletedReply({ result }),
		key: "remaining",
	});
}

function replyTextOf({ result }: { result: ReplayExecutionResult }) {
	return JSON.stringify(expectCompletedReply({ result }));
}

function balanceAfterOf({ result }: { result: ReplayExecutionResult }) {
	if (result.kind !== "completed")
		throw new Error(`expected completion, received ${JSON.stringify(result)}`);
	const { decision } = result;
	if (!("outcome" in decision))
		throw new Error("expected a track decision carrying an outcome");
	return decision.outcome.balanceAfter;
}

function trackOutcomesOf({ records }: { records: MeteringRecord[] }) {
	return records.filter((record) => record.type === "track_outcome");
}

function createCompositionHarness() {
	const fixture = createReplayHydrationFixture();
	const records: MeteringRecord[] = [];
	const store = openSqliteBalanceStateStore({ databasePath: ":memory:" });
	store.initializePartition({ topic, partition, nextOffset: 0n });
	const worker = createWorkerFixture({
		stateStore: store,
		records,
		now: fixture.selection.baseline.capturedAtMs,
	});
	const loads = { count: 0 };
	const coordinator = createReplayHydrationCoordinator({
		source: createLoadedSource({
			state: fixture.state,
			onLoad: async () => {
				loads.count += 1;
				return { kind: "loaded", state: fixture.state };
			},
		}),
		client: worker.client,
	});
	const baseline = {
		id: "snapshot-composition",
		capturedAtMs: fixture.selection.baseline.capturedAtMs,
	};
	return {
		fixture,
		records,
		loads,
		archived: ({
			id,
			operation,
			offsetMs,
			body,
		}: {
			id: string;
			operation: ReplayOperation;
			offsetMs: number;
			body: ReplayRequestBody;
		}): ReplayArchiveRecord =>
			createArchiveRecord({
				id,
				operation,
				offsetMs,
				body,
				orgId: fixture.selection.identity.orgId,
				env: replayEnvOf({ identity: fixture.selection.identity }),
				customerId: fixture.selection.identity.customerId,
			}),
		execute: ({ record }: { record: ReplayArchiveRecord }) =>
			executeReplayRequest({
				request: buildReplayRequest({ record, baseline }),
				selection: fixture.selection,
				coordinator,
				readContext: () => fixture.ctx,
			}),
		close: async () => {
			await coordinator.close();
			await worker.close();
			store.close();
		},
	};
}

test.concurrent(
	"cold track 5 on 72 reports remaining 67, check agrees and a replayed request does not charge twice",
	async () => {
		const harness = createCompositionHarness();
		try {
			const track = harness.archived({
				id: "obs_track",
				operation: "track",
				offsetMs: 1_000,
				body: { feature_id: "messages", value: 5 },
			});
			expect(
				remainingOf({ result: await harness.execute({ record: track }) }),
			).toBe(67);
			const check = await harness.execute({
				record: harness.archived({
					id: "obs_check",
					operation: "check",
					offsetMs: 2_000,
					body: { feature_id: "messages" },
				}),
			});
			expect(remainingOf({ result: check })).toBe(67);
			const duplicate = await harness.execute({ record: track });
			expect(remainingOf({ result: duplicate })).toBe(67);
			expect(harness.loads.count).toBe(1);
			expect(harness.records.map((record) => record.type)).toEqual([
				"state_initialized",
				"track_outcome",
			]);
		} finally {
			await harness.close();
		}
	},
);

test.concurrent(
	"a rejected track completes as a business rejection with the public insufficient balance reply",
	async () => {
		const harness = createCompositionHarness();
		try {
			const result = await harness.execute({
				record: harness.archived({
					id: "obs_reject",
					operation: "track",
					offsetMs: 1_000,
					body: {
						feature_id: "messages",
						value: 100,
						overage_behavior: "reject",
					},
				}),
			});
			expect(result.kind).toBe("completed");
			expect(replyTextOf({ result })).toContain("insufficient_balance");
			expect(balanceAfterOf({ result })).toBe(72);
			expect(trackOutcomesOf({ records: harness.records })).toHaveLength(1);
			expect(harness.loads.count).toBe(1);
		} finally {
			await harness.close();
		}
	},
);
