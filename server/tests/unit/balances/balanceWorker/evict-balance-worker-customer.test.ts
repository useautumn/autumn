import { describe, expect, test } from "bun:test";
import type { EvictCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { contexts } from "../../../utils/fixtures/db/contexts.js";

function createHarness({
	directFailure,
	queueFailure,
}: {
	directFailure?: unknown;
	queueFailure?: unknown;
} = {}) {
	const sent: EvictCommand[] = [];
	const queued: EvictCommand[] = [];
	const errors: unknown[][] = [];
	const base = contexts.create({ features: [] });
	const ctx = {
		...base,
		id: "req_evict",
		timestamp: 1_700_000_000_000,
		logger: {
			...base.logger,
			error: (...args: unknown[]) => {
				errors.push(args);
			},
		},
	};
	const client = {
		evict: async ({ command }: { command: EvictCommand }) => {
			sent.push(command);
			if (directFailure) throw directFailure;
			return { evicted: true };
		},
		queue: {
			evict: async ({ commands }: { commands: readonly EvictCommand[] }) => {
				if (queueFailure) throw queueFailure;
				queued.push(...commands);
			},
		},
	};
	return { ctx, client, sent, queued, errors };
}

const notReady = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "Worker is still activating the partition",
		workerCode: "NOT_READY",
	});

describe("evictBalanceWorkerCustomer", () => {
	test("a server evict names the customer under the request's id, whatever the rollout says", async () => {
		const h = createHarness();
		const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		try {
			await evictBalanceWorkerCustomer({
				ctx: h.ctx,
				customerId: "cus_1",
				client: h.client,
			});
		} finally {
			if (previousRollout === undefined)
				delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
			else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
		}
		expect(h.sent).toHaveLength(1);
		expect(h.sent[0]).toMatchObject({
			type: "evict",
			requestId: "req_evict",
			identity: { customerId: "cus_1", entityId: null },
		});
		expect(h.queued).toHaveLength(0);
	});

	test("an evict a handing-off partition never took is queued for its owner, not dropped", async () => {
		for (const directFailure of [
			notReady(),
			new BalanceWorkerClientError({
				code: "NO_OWNER",
				outcome: "not_submitted",
				message: "No worker owns the command partition",
			}),
			new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "unknown",
				message: "Worker request deadline exceeded",
			}),
		]) {
			const h = createHarness({ directFailure });
			await evictBalanceWorkerCustomer({
				ctx: h.ctx,
				customerId: "cus_1",
				client: h.client,
			});
			expect(h.queued).toEqual(h.sent);
			expect(h.errors).toHaveLength(0);
		}
	});

	test("an unconfirmed evict a Postgres read waits on is queued and still reported: the read may miss the worker's writes", async () => {
		const h = createHarness({ directFailure: notReady() });
		await evictBalanceWorkerCustomer({
			ctx: h.ctx,
			customerId: "cus_1",
			client: h.client,
			barrier: true,
		});
		expect(h.queued).toEqual(h.sent);
		expect(h.errors).toHaveLength(1);
		expect(h.errors[0]?.[0]).toContain("before a Postgres read");
	});

	test("an evict neither the worker nor the log took is reported as stale", async () => {
		const h = createHarness({
			directFailure: notReady(),
			queueFailure: new Error("command log unavailable"),
		});
		await evictBalanceWorkerCustomer({
			ctx: h.ctx,
			customerId: "cus_1",
			client: h.client,
		});
		expect(h.errors).toHaveLength(1);
		expect(h.errors[0]?.[0]).toContain("worker rows may be stale");
	});

	test("a worker verdict is reported, not queued", async () => {
		const h = createHarness({
			directFailure: new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				outcome: "not_submitted",
				message: "Invalid worker request",
				workerCode: "INVALID_REQUEST",
			}),
		});
		await evictBalanceWorkerCustomer({
			ctx: h.ctx,
			customerId: "cus_1",
			client: h.client,
		});
		expect(h.queued).toHaveLength(0);
		expect(h.errors).toHaveLength(1);
	});
});
