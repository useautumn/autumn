import { afterAll, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

const mockState = {
	cacheReads: [] as string[],
	executeCalls: [] as unknown[],
};

mock.module(
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

describe("syncItemV4 cache misses", () => {
	test("drops balance sync after a feature cache miss", async () => {
		mockState.cacheReads = [];
		mockState.executeCalls = [];

		const ctx = {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			features: [],
			extraLogs: {},
			logger: { warn: mock(() => {}) },
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
		};

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
});

afterAll(() => {
	mock.restore();
});
