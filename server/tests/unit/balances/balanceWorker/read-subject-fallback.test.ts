import { describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";

const postgresSubject = {
	customer: { internal_id: "cus_from_postgres" },
} as unknown as FullSubject;

function createHarness({ failure }: { failure: BalanceWorkerClientError }) {
	const fallbackCalls: { customerId: string; entityId?: string | null }[] = [];
	const warnings: unknown[][] = [];
	const ctx = {
		...contexts.create({}),
		// The command carries the request id and time; the fixture context sets neither.
		id: "req_read_fallback",
		timestamp: 1_700_000_000_000,
		logger: {
			...contexts.create({}).logger,
			warn: (...args: unknown[]) => {
				warnings.push(args);
			},
		},
	};
	const client = {
		readSubjectState: async () => {
			throw failure;
		},
	};
	const readFallback = async ({
		customerId,
		entityId,
	}: {
		customerId: string;
		entityId?: string | null;
	}) => {
		fallbackCalls.push({ customerId, entityId });
		return postgresSubject;
	};
	return { ctx, client, readFallback, fallbackCalls, warnings };
}

describe("readBalanceWorkerSubject", () => {
	test("a read the worker never answered comes from Postgres, logged as a fail-open", async () => {
		const h = createHarness({
			failure: new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "unknown",
				message: "timed out after the send",
			}),
		});
		const subject = await readBalanceWorkerSubject({
			ctx: h.ctx,
			customerId: "cus_1",
			entityId: "ent_1",
			client: h.client,
			readFallback: h.readFallback,
		});
		expect(subject).toBe(postgresSubject);
		expect(h.fallbackCalls).toEqual([
			{ customerId: "cus_1", entityId: "ent_1" },
		]);
		expect(h.ctx.extraLogs.balanceWorkerFailOpen).toBe("read");
		expect(h.warnings).toHaveLength(1);
		expect(h.warnings[0]?.[1]).toMatchObject({
			type: "balance_worker_fail_open",
			data: { source: "read", reason: "balance_worker_result_unknown" },
		});
	});

	test("an overloaded or unreachable worker falls back the same way", async () => {
		for (const failure of [
			new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				outcome: "not_submitted",
				message: "at capacity",
				workerCode: "OVERLOADED",
			}),
			new BalanceWorkerClientError({
				code: "NO_OWNER",
				outcome: "not_submitted",
				message: "no owner",
			}),
		]) {
			const h = createHarness({ failure });
			const subject = await readBalanceWorkerSubject({
				ctx: h.ctx,
				customerId: "cus_1",
				client: h.client,
				readFallback: h.readFallback,
			});
			expect(subject).toBe(postgresSubject);
			expect(h.fallbackCalls).toHaveLength(1);
		}
	});

	test("a verdict from the worker propagates: a missing customer is not read from Postgres", async () => {
		const h = createHarness({
			failure: new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				outcome: "not_submitted",
				message: "customer not found",
				workerCode: "CUSTOMER_NOT_FOUND",
			}),
		});
		await expect(
			readBalanceWorkerSubject({
				ctx: h.ctx,
				customerId: "cus_1",
				client: h.client,
				readFallback: h.readFallback,
			}),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(h.fallbackCalls).toEqual([]);
		expect(h.warnings).toEqual([]);
	});
});
