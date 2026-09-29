import { beforeEach, describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { ErrCode, RecaseError } from "@autumn/shared";
import { createCustomerFixture } from "../balances/balanceWorker/customer-fixture.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const { ctx, fullSubject } = createCustomerFixture();
/** The lane's steps in the order they ran. */
const lane: string[] = [];

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	() => ({
		getBalanceWorkerClient: () => ({
			evict: async () => {
				lane.push("evict");
				return { evicted: true };
			},
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	() => ({
		getFullSubject: async () => {
			lane.push("read");
			return fullSubject;
		},
	}),
);
const { withPaidAllocatedFallback } = await import(
	"@/internal/balanceWorker/subject/withPaidAllocatedFallback.js"
);

const refusal = ({ reason }: { reason: string }) =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: `Unsupported command: ${reason}`,
		workerCode: "UNSUPPORTED_COMMAND",
		workerReason: reason,
	});

const failing = (error: unknown) => async () => {
	throw error;
};

const postgres = async ({
	fullSubject: read,
}: {
	fullSubject: { customerId: string };
}) => {
	lane.push("postgres");
	return read.customerId;
};

beforeEach(() => {
	lane.length = 0;
});

describe("withPaidAllocatedFallback", () => {
	test("a paid allocated refusal runs the Postgres step on fresh rows, between two evicts", async () => {
		const result = await withPaidAllocatedFallback({
			ctx,
			customerId: "cus_test",
			worker: failing(refusal({ reason: "paid_allocated_not_supported" })),
			postgres,
		});
		expect(result).toBe(fullSubject.customerId);
		expect(lane).toEqual(["evict", "read", "postgres", "evict"]);
	});

	test("a failing Postgres step still evicts after, and its error is rethrown", async () => {
		const failure = new Error("stripe declined");
		await expect(
			withPaidAllocatedFallback({
				ctx,
				customerId: "cus_test",
				worker: failing(refusal({ reason: "paid_allocated_not_supported" })),
				postgres: failing(failure),
			}),
		).rejects.toBe(failure);
		expect(lane).toEqual(["evict", "read", "evict"]);
	});

	test("the worker's result is returned when it answers; every other error is rethrown untouched", async () => {
		expect(
			await withPaidAllocatedFallback({
				ctx,
				customerId: "cus_test",
				worker: async () => "worker",
				postgres,
			}),
		).toBe("worker");
		const errors = [
			refusal({ reason: "feature_not_found" }),
			new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				outcome: "not_submitted",
				message: "stale",
				workerCode: "STALE_SUBJECT",
			}),
			new RecaseError({
				message: "no",
				code: ErrCode.CustomerNotFound,
				statusCode: 404,
			}),
			new Error("transport"),
		];
		for (const error of errors) {
			await expect(
				withPaidAllocatedFallback({
					ctx,
					customerId: "cus_test",
					worker: failing(error),
					postgres,
				}),
			).rejects.toBe(error);
		}
		expect(lane).toEqual([]);
	});
});
