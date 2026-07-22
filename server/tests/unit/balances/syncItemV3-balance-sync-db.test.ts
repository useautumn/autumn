import { afterAll, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

const lockedDb = {
	execute: mock(async () => []),
};
let receivedBalanceSyncDb: unknown;

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js",
	() => ({
		getCachedFullCustomer: async ({
			balanceSyncDb,
		}: {
			balanceSyncDb?: unknown;
		}) => {
			receivedBalanceSyncDb = balanceSyncDb;
			return {
				id: "customer_1",
				internal_id: "internal_customer_1",
				customer_products: [],
				extra_customer_entitlements: [],
			};
		},
	}),
);

const { syncItemV3WithDb } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/utils/sync/syncItemV3.js?existingBalanceSyncDb"
);

test("reuses its balance-sync transaction for legacy cache lazy resets", async () => {
	receivedBalanceSyncDb = undefined;
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		logger: { info: mock(() => {}), warn: mock(() => {}) },
	} as never;

	await syncItemV3WithDb({
		ctx,
		db: lockedDb as never,
		payload: {
			customerId: "customer_1",
			orgId: "org_1",
			env: AppEnv.Sandbox,
			timestamp: 1,
			cusEntIds: [],
		},
	});

	expect(receivedBalanceSyncDb).toBe(lockedDb);
});

afterAll(() => {
	mock.restore();
});
