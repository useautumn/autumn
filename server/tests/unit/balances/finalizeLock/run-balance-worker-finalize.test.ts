import { describe, expect, test } from "bun:test";
import type { FinalizeCommand, WorkerLock } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runBalanceWorkerFinalize } from "@/internal/balances/finalizeLock/balanceWorker/runBalanceWorkerFinalize.js";

const lock: WorkerLock = {
	id: "lock_row_1",
	org_id: "org_test",
	env: "sandbox",
	lock_id: "L1",
	internal_customer_id: "cus_internal_1",
	customer_id: "cus_1",
	entity_id: null,
	feature_id: "messages",
	overage_behavior: "reject",
	properties: {},
	deltas: [],
	expires_at: 1_900_000_000_000,
	expiry_action: "confirm",
	created_at: 1_800_000_000_000,
};

const createCtx = (): AutumnContext => ({
	...contexts.create({
		features: [{ id: "messages", internal_id: "fe_messages" }] as never,
	}),
	id: "req_finalize_1",
	timestamp: 1_800_000_000_000,
	extraLogs: {},
});

/** A worker that fails every finalize with `failure`, and records what was queued instead. */
const createClient = ({ failure }: { failure: BalanceWorkerClientError }) => {
	const queued: FinalizeCommand[] = [];
	const client = {
		finalize: async () => {
			throw failure;
		},
		queue: {
			track: async () => undefined,
			reset: async () => undefined,
			updateBalance: async () => undefined,
			evict: async () => undefined,
			finalize: async ({
				commands,
			}: {
				commands: readonly FinalizeCommand[];
			}) => {
				queued.push(...commands);
			},
		},
	};
	return { client, queued };
};

describe("runBalanceWorkerFinalize", () => {
	test("an unreachable owner gets the finalize queued, answered as the legacy replay is", async () => {
		const ctx = createCtx();
		const { client, queued } = createClient({
			failure: new BalanceWorkerClientError({
				code: "NO_OWNER",
				outcome: "not_submitted",
				message: "no owner for the partition",
			}),
		});

		const response = await runBalanceWorkerFinalize({
			ctx,
			params: { lock_id: "L1", action: "confirm" },
			lock,
			client,
		});

		expect(response).toEqual({ success: true });
		expect(ctx.extraLogs.finalizeLockQueuedForReplay).toBe(true);
		expect(queued).toMatchObject([
			{ type: "finalize", commandId: "req_finalize_1", lock },
		]);
	});

	test("a finalize that may already have applied is not queued a second time", async () => {
		const { client, queued } = createClient({
			failure: new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "unknown",
				message: "timed out after the send",
			}),
		});

		await expect(
			runBalanceWorkerFinalize({
				ctx: createCtx(),
				params: { lock_id: "L1", action: "confirm" },
				lock,
				client,
			}),
		).rejects.toMatchObject({ code: "balance_worker_result_unknown" });
		expect(queued).toEqual([]);
	});
});
