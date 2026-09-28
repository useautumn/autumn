import { describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { withBalanceWorkerFailOpen } from "@/internal/balances/balanceWorker/failOpen/withBalanceWorkerFailOpen.js";

const failingWith = (cause: BalanceWorkerClientError) => async () =>
	rethrowBalanceWorkerError({ cause });

const failOpen = ({ run }: { run: () => Promise<string> }) =>
	withBalanceWorkerFailOpen({
		ctx: contexts.create({}),
		source: "test",
		run,
		fallback: async () => "fallback",
	});

describe("withBalanceWorkerFailOpen", () => {
	test("a worker answer passes through", async () => {
		expect(await failOpen({ run: async () => "worker" })).toEqual({
			result: "worker",
			failedOpen: false,
		});
	});

	test("an org over its rate cap never reaches the worker and falls back with that reason", async () => {
		let ran = false;
		const ctx = { ...contexts.create({}), orgRateLimitDegraded: true };
		expect(
			await withBalanceWorkerFailOpen({
				ctx,
				source: "test",
				run: async () => {
					ran = true;
					return "worker";
				},
				fallback: async ({ reason }) => reason,
			}),
		).toEqual({ result: "org_rate_limit", failedOpen: true });
		expect(ran).toBe(false);
	});

	test("an unreachable worker that never got the command falls back", async () => {
		const unreachable = new BalanceWorkerClientError({
			code: "NO_OWNER",
			outcome: "not_submitted",
			message: "no owner for the partition",
		});
		expect(await failOpen({ run: failingWith(unreachable) })).toEqual({
			result: "fallback",
			failedOpen: true,
		});
	});

	test("a command that may already have applied propagates instead of falling back", async () => {
		const unconfirmed = new BalanceWorkerClientError({
			code: "DEADLINE",
			outcome: "unknown",
			message: "timed out after the send",
		});
		await expect(
			failOpen({ run: failingWith(unconfirmed) }),
		).rejects.toMatchObject({
			code: "balance_worker_result_unknown",
		});
	});

	test("a worker verdict propagates", async () => {
		const notFound = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			outcome: "not_submitted",
			message: "customer not found",
			workerCode: "CUSTOMER_NOT_FOUND",
		});
		await expect(
			failOpen({ run: failingWith(notFound) }),
		).rejects.toMatchObject({
			statusCode: 404,
		});
	});
});
