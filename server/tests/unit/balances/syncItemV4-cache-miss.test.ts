import { afterAll, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	cacheReads: [] as string[],
	executeCalls: [] as unknown[],
};

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js",
	() => ({
		getCachedFeatureBalancesBatch: async () => ({ kind: "ok", value: [] }),
		getCachedFeatureBalance: async ({ featureId }: { featureId: string }) => {
			mockState.cacheReads.push(featureId);
			if (featureId === "missing_feature") {
				return { kind: "missing", reason: "single_field_null" };
			}

			return {
				kind: "ok",
				value: {
					featureId,
					balances: [
						{
							id: "cus_ent_present",
							feature_id: featureId,
							balance: 42,
							adjustment: 0,
							entities: null,
							usage_windows: null,
							next_reset_at: null,
							entity_count: 0,
							cache_version: 0,
							isEntityLevel: false,
							rollovers: [],
						},
					],
				},
			};
		},
	}),
);

const { syncItemV4 } = await import(
	"@/internal/balances/utils/sync/syncItemV4.js"
);

const buildCtx = () => ({
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
	features: [],
	extraLogs: {},
	logger: { warn: mock(() => {}), info: mock(() => {}) },
	db: {
		execute: mock(async (query: unknown) => {
			mockState.executeCalls.push(query);
			return [
				{
					sync_balances_v2: {
						updates: { cus_ent_present: {} },
						rollover_updates: {},
					},
				},
			];
		}),
	},
});

describe("syncItemV4 cache misses", () => {
	test("drops balance sync after a feature cache miss", async () => {
		mockState.cacheReads = [];
		mockState.executeCalls = [];

		const ctx = buildCtx();

		await syncItemV4({
			ctx: ctx as never,
			payload: {
				customerId: "cus_1",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				timestamp: 1,
				modifiedCusEntIdsByFeatureId: {
					missing_feature: ["cus_ent_missing"],
					present_feature: ["cus_ent_present"],
				},
			},
		});

		expect(mockState.cacheReads).toEqual(["missing_feature"]);
		expect(mockState.executeCalls).toHaveLength(0);
	});

	test("falls back to payload balance snapshots on a cache miss", async () => {
		mockState.cacheReads = [];
		mockState.executeCalls = [];

		const ctx = buildCtx();

		await syncItemV4({
			ctx: ctx as never,
			payload: {
				customerId: "cus_1",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				timestamp: 1,
				modifiedCusEntIdsByFeatureId: {
					missing_feature: ["cus_ent_missing"],
				},
				balanceSnapshots: [
					{
						customer_entitlement_id: "cus_ent_missing",
						feature_id: "missing_feature",
						balance: -50,
						adjustment: 0,
						entities: null,
						next_reset_at: null,
						entity_count: 0,
						cache_version: 0,
					},
				],
			},
		});

		// The deduction still reaches Postgres even though the cache no longer
		// holds it — otherwise the tracked usage would be lost for good.
		expect(mockState.executeCalls).toHaveLength(1);
		expect(JSON.stringify(mockState.executeCalls[0])).toContain("-50");
	});
});

afterAll(() => {
	mock.restore();
});
