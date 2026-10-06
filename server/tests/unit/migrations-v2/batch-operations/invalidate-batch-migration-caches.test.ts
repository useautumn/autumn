import { afterAll, describe, expect, mock, test } from "bun:test";

const batchInvalidateModulePath =
	"@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
const routingModulePath = "@/external/redis/customerRedisRouting.js";

const realBatchInvalidate = { ...(await import(batchInvalidateModulePath)) };
const realRouting = { ...(await import(routingModulePath)) };

let receivedCustomerIds: string[] = [];
let receivedCommandTimeoutMs: number | undefined;

mock.module(batchInvalidateModulePath, () => ({
	...realBatchInvalidate,
	batchInvalidateCachedFullSubjects: async ({
		customers,
		phases,
		commandTimeoutMs,
	}: {
		customers: { customerId: string }[];
		phases?: Record<string, number>;
		commandTimeoutMs?: number;
	}) => {
		receivedCustomerIds = customers.map((customer) => customer.customerId);
		receivedCommandTimeoutMs = commandTimeoutMs;
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

const changedCustomers = [customer("cus_a"), customer("cus_b")];

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
	test("busts exactly the customers it is given", async () => {
		const { ctx } = buildCtx();
		const invalidated = await invalidateBatchMigrationCaches({
			ctx,
			customers: changedCustomers,
		});
		expect(invalidated).toBe(2);
		expect(receivedCustomerIds).toEqual(["cus_a", "cus_b"]);
		expect(receivedCommandTimeoutMs).toBe(10_000);
	});

	test("logs the Postgres/Redis split for every page", async () => {
		const { ctx, infoLogs } = buildCtx();
		await invalidateBatchMigrationCaches({ ctx, customers: changedCustomers });
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
