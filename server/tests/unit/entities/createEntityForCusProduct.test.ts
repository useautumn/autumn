import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockDecrement = mock(async () => {});
const mockUpdate = mock(async () => {});
const mockAdjustAllowance = mock(async () => ({ deletedReplaceables: [] }));
const mockGetReps = mock(() => []);
const mockGetByIds = mock(async ({ ids }: { ids: string[] }) =>
	latestCusEnts
		.filter((c) => ids.includes(c.id))
		.map((c) => JSON.parse(JSON.stringify(c))), // deep clone to simulate a DB snapshot
);

// latestCusEnts is populated per-test in beforeEach
let latestCusEnts: any[] = [];

await mockModuleWithRestore("@/external/redis/utils/lockUtils/acquireLock.js", () => ({
	acquireLock: mock(async () => {}),
}));
await mockModuleWithRestore("@/external/redis/utils/lockUtils/clearLock.js", () => ({
	clearLock: mock(async () => {}),
}));
await mockModuleWithRestore("@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js", () => ({
	adjustAllowance: mockAdjustAllowance,
}));
await mockModuleWithRestore("@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedUpgrade.js", () => ({
	getReps: mockGetReps,
}));
await mockModuleWithRestore("@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js", () => ({
	CusEntService: {
		decrement: mockDecrement,
		update: mockUpdate,
		getByIds: mockGetByIds,
	},
}));
await mockModuleWithRestore("@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer", () => ({
	deleteCachedFullCustomer: mock(async () => {}),
}));

const { createEntityForCusProduct } = await import(
	"@/internal/entities/handlers/handleCreateEntity/createEntityForCusProduct.js"
);

describe("createEntityForCusProduct (pooled balance fix)", () => {
	afterEach(() => {
		// Reset mock call counts and shared state after each test so they never
		// bleed into subsequent tests, regardless of how many tests are added.
		mockDecrement.mockClear();
		mockUpdate.mockClear();
		mockGetByIds.mockClear();
		mockAdjustAllowance.mockClear();
		mockGetReps.mockClear();
		latestCusEnts = [];
	});

	test("correctly decrements and records entities on the synthetic entitlement, and avoids duplicate processing across products", async () => {
		const customer: any = {
			id: "cus_123",
			internal_id: "cus_int_123",
			org_id: "org_123",
			env: "sandbox",
			pooled_customer_entitlements: [
				{
					id: "cus_ent_synthetic",
					entitlement: {
						id: "ent_synthetic",
						pooled: true,
						feature: {
							id: "organization",
							internal_id: "feat_int_123",
							name: "Organization",
						},
					},
					balance: 10,
					entities: {},
					is_pooled_balance: true,
					pooled_balance_id: "pool_123",
					pooled_balance: {
						id: "pool_123",
						granted: 10,
					},
				},
			],
		};

		const cusProduct1: any = {
			id: "cp_1",
			customer_entitlements: [
				{
					id: "cus_ent_source_1",
					entitlement: {
						id: "ent_source_1",
						pooled: true,
						feature: {
							id: "organization",
							internal_id: "feat_int_123",
							name: "Organization",
						},
					},
					balance: 0,
					entities: null,
					pooled_balance_contribution: {
						pooled_balance_id: "pool_123",
					},
				},
			],
			customer_prices: [],
		};

		const cusProduct2: any = {
			id: "cp_2",
			customer_entitlements: [
				{
					id: "cus_ent_source_2",
					entitlement: {
						id: "ent_source_2",
						pooled: true,
						feature: {
							id: "organization",
							internal_id: "feat_int_123",
							name: "Organization",
						},
					},
					balance: 0,
					entities: null,
					pooled_balance_contribution: {
						pooled_balance_id: "pool_123",
					},
				},
			],
			customer_prices: [],
		};

		const ctx: any = {
			org: { id: "org_123" },
			env: "sandbox",
			features: [
				{
					id: "organization",
					internal_id: "feat_int_123",
					name: "Organization",
				},
			],
			db: {} as any,
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
			},
		};

		// Populate the DB-snapshot list that the mock will deep-clone per call.
		// This simulates the persisted state (including state updated by product 1's run
		// when product 2 reloads) so dedup is validated against a genuine snapshot.
		latestCusEnts = [
			customer.pooled_customer_entitlements[0],
			cusProduct1.customer_entitlements[0],
			cusProduct2.customer_entitlements[0],
		];

		const inputEntities = [{ id: "org_1", feature_id: "organization" }];

		// 1. Process product 1: Should decrement the pool and add org_1
		await createEntityForCusProduct({
			ctx,
			customer,
			cusProduct: cusProduct1,
			inputEntities,
		});

		expect(mockDecrement).toHaveBeenCalledTimes(1);
		expect(mockDecrement.mock.calls[0][0].id).toBe("cus_ent_synthetic");
		expect(mockDecrement.mock.calls[0][0].amount).toBe(1);

		expect(mockUpdate).toHaveBeenCalledTimes(1);
		expect(mockUpdate.mock.calls[0][0].id).toBe("cus_ent_synthetic");
		expect(mockUpdate.mock.calls[0][0].updates.entities).toEqual({
			org_1: {
				id: "org_1",
				balance: 10, // from pooled_balance.granted
				adjustment: 0,
			},
		});

		// Check in-memory updates on the customer object
		const syntheticEnt = customer.pooled_customer_entitlements[0];
		expect(syntheticEnt.balance).toBe(9);
		expect(syntheticEnt.entities).toEqual({
			org_1: {
				id: "org_1",
				balance: 10,
				adjustment: 0,
			},
		});

		// Reset counts before product 2 so we can assert only on what product 2 does.
		mockDecrement.mockClear();
		mockUpdate.mockClear();

		// 2. Process product 2: The deep-cloned reload from getByIds now reflects
		// the entities map written by product 1 (because latestCusEnts[0] was mutated
		// in-memory by step 1). The dedup filter should see org_1 already present and skip.
		await createEntityForCusProduct({
			ctx,
			customer,
			cusProduct: cusProduct2,
			inputEntities,
		});

		expect(mockDecrement).toHaveBeenCalledTimes(0);
		expect(mockUpdate).toHaveBeenCalledTimes(0);
	});

	test("throws when synthetic pooled entitlement is not found (fail fast)", async () => {
		const customer: any = {
			id: "cus_123",
			internal_id: "cus_int_123",
			org_id: "org_123",
			env: "sandbox",
			// No matching pool for pool_xyz
			pooled_customer_entitlements: [],
		};

		const cusProduct: any = {
			id: "cp_1",
			customer_entitlements: [
				{
					id: "cus_ent_source_1",
					entitlement: {
						id: "ent_source_1",
						pooled: true,
						feature: {
							id: "organization",
							internal_id: "feat_int_123",
							name: "Organization",
						},
					},
					balance: 0,
					entities: null,
					pooled_balance_contribution: {
						pooled_balance_id: "pool_xyz",
					},
				},
			],
			customer_prices: [],
		};

		const ctx: any = {
			org: { id: "org_123" },
			env: "sandbox",
			features: [
				{
					id: "organization",
					internal_id: "feat_int_123",
					name: "Organization",
				},
			],
			db: {} as any,
		};

		const inputEntities = [{ id: "org_1", feature_id: "organization" }];

		await expect(
			createEntityForCusProduct({ ctx, customer, cusProduct, inputEntities }),
		).rejects.toThrow("pool_xyz");
	});
});

afterAll(() => {
	mock.restore();
});
