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

	test("a command the worker never confirmed falls back, and the fallback learns it may have applied", async () => {
		const unconfirmed = new BalanceWorkerClientError({
			code: "DEADLINE",
			outcome: "unknown",
			message: "timed out after the send",
		});
		const reasons: string[] = [];
		const outcome = await withBalanceWorkerFailOpen({
			ctx: contexts.create({}),
			source: "test",
			run: failingWith(unconfirmed),
			fallback: async ({ reason }) => {
				reasons.push(reason);
				return "fallback";
			},
		});
		expect(outcome).toEqual({ result: "fallback", failedOpen: true });
		expect(reasons).toEqual(["balance_worker_result_unknown"]);
	});
	test("a command the worker shed as overloaded falls back instead of a 429", async () => {
		const overloaded = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			outcome: "not_submitted",
			message: "at capacity for this customer",
			workerCode: "OVERLOADED",
		});
		expect(await failOpen({ run: failingWith(overloaded) })).toEqual({
			result: "fallback",
			failedOpen: true,
		});
	});
	test("a partition that is not ready falls back", async () => {
		const notReady = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			outcome: "not_submitted",
			message: "partition cannot accept this request",
			workerCode: "NOT_READY",
		});
		expect(await failOpen({ run: failingWith(notReady) })).toEqual({
			result: "fallback",
			failedOpen: true,
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
