import { afterAll, describe, expect, mock, test } from "bun:test";
import type { BatchMigrationPageResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

const batchInvalidateModulePath =
	"@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
const routingModulePath = "@/external/redis/customerRedisRouting.js";

const realBatchInvalidate = { ...(await import(batchInvalidateModulePath)) };
const realRouting = { ...(await import(routingModulePath)) };

let receivedCustomerIds: string[] = [];

mock.module(batchInvalidateModulePath, () => ({
	...realBatchInvalidate,
	batchInvalidateCachedFullSubjects: async ({
		customers,
		phases,
	}: {
		customers: { customerId: string }[];
		phases?: Record<string, number>;
	}) => {
		receivedCustomerIds = customers.map((customer) => customer.customerId);
		if (phases) {
			phases.invalidate_marks_db = 7;
			phases.invalidate_redis = 11;
		}
		return customers.length;
	},
}));
mock.module(routingModulePath, () => ({
	...realRouting,
	getRedisTargetsForCustomer: () => [],
}));

const { invalidateBatchMigrationCaches } = await import(
	"@/internal/migrations/v2/batchOperations/finalize/invalidateBatchMigrationCaches.js"
);

afterAll(() => {
	mock.module(batchInvalidateModulePath, () => realBatchInvalidate);
	mock.module(routingModulePath, () => realRouting);
});

const customer = (id: string) => ({
	internalId: `internal_${id}`,
	id,
	name: null,
	email: null,
});

const pageResult: BatchMigrationPageResult = {
	succeeded: [customer("cus_a"), customer("cus_b")],
	skipped: [customer("cus_converged")],
	insertedItems: [],
	removedItems: [],
	repointedProducts: [],
};

const buildCtx = () => {
	const infoLogs: { message: string; data?: Record<string, unknown> }[] = [];
	const ctx = {
		org: { id: "org_test", redis_config: null },
		env: "live",
		features: [],
		logger: {
			debug: () => {},
			info: (message: string, extra?: { data?: Record<string, unknown> }) => {
				infoLogs.push({ message, data: extra?.data });
			},
			warn: () => {},
			error: () => {},
		},
		// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the finalizer
	} as any;
	return { ctx, infoLogs };
};

describe("invalidateBatchMigrationCaches", () => {
	test("busts only mutated customers on a normal run", async () => {
		const { ctx } = buildCtx();
		const invalidated = await invalidateBatchMigrationCaches({
			ctx,
			pageResult,
		});
		expect(invalidated).toBe(2);
		expect(receivedCustomerIds).toEqual(["cus_a", "cus_b"]);
	});

	test("also busts skipped customers when a retry re-claims them", async () => {
		const { ctx } = buildCtx();
		const invalidated = await invalidateBatchMigrationCaches({
			ctx,
			pageResult,
			includeSkipped: true,
		});
		expect(invalidated).toBe(3);
		expect(receivedCustomerIds).toEqual(["cus_a", "cus_b", "cus_converged"]);
	});

	test("logs the Postgres/Redis split for every page", async () => {
		const { ctx, infoLogs } = buildCtx();
		await invalidateBatchMigrationCaches({ ctx, pageResult });
		const line = infoLogs.find(
			(entry) => entry.message === "batch-migration: page caches invalidated",
		);
		expect(line?.data).toMatchObject({
			customers: 2,
			invalidate_marks_db: 7,
			invalidate_redis: 11,
		});
	});
});
