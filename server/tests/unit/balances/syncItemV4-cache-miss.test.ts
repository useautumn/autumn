import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	cacheReads: [] as string[],
	cacheMissing: false,
	executeCalls: 0,
	executeArgs: [] as unknown[],
	currentBalanceFields: {} as Record<string, string | null>,
	currentUsageWindows: {} as Record<string, string | null>,
	syncedIds: [] as string[],
};

const deleteCachedFullCustomer = mock(async () => {});

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({ deleteCachedFullCustomer }),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/sync/flushSubjectBalancesToDb.js",
	() => ({
		subjectBalanceToSyncEntry: ({
			subjectBalance,
		}: {
			subjectBalance: { id: string; balance: number };
		}) => {
			state.syncedIds.push(subjectBalance.id);
			return {
				customer_entitlement_id: subjectBalance.id,
				balance: subjectBalance.balance,
			};
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js",
	() => ({
		getCachedFeatureBalancesBatch: async () => ({ kind: "ok", value: [] }),
		getCachedFeatureBalance: async ({ featureId }: { featureId: string }) => {
			state.cacheReads.push(featureId);
			if (state.cacheMissing) {
				return { kind: "missing", reason: "single_field_null" };
			}
			return {
				kind: "ok",
				value: {
					featureId,
					balances: [
						{
							id: "cus_ent_1",
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

const { RetryableBalanceSyncError, syncItemV4 } = await import(
	"@/internal/balances/utils/sync/syncItemV4.js"
);

const buildContext = ({
	generations = [null],
	lockResult = "OK" as "OK" | null,
	postgresError,
}: {
	generations?: (string | null)[];
	lockResult?: "OK" | null;
	postgresError?: Error;
} = {}) => {
	let generationRead = 0;
	const deleteOwnedLock = mock(async () => 1);
	return {
		ctx: {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			features: [],
			extraLogs: {},
			logger: { warn: mock(() => {}) },
			redisV2: {
				get: mock(
					async () =>
						generations[Math.min(generationRead++, generations.length - 1)],
				),
				set: mock(async () => lockResult),
				hmget: mock(async (_key: string, ...fields: string[]) =>
					fields.map((field) => state.currentBalanceFields[field] ?? null),
				),
				hget: mock(async (key: string) => {
					const keyParts = key.split(":");
					const featureId = keyParts[keyParts.length - 1] ?? "";
					return state.currentUsageWindows[featureId] ?? null;
				}),
				deleteOwnedLock,
			},
			db: {
				execute: mock(async (query: unknown) => {
					state.executeCalls++;
					state.executeArgs.push(query);
					if (postgresError) throw postgresError;
					return [];
				}),
			},
		} as never,
		deleteOwnedLock,
	};
};

const payload = ({
	modifiedCusEntIdsByFeatureId = { messages: ["cus_ent_1"] },
	usageWindowUpdates,
}: {
	modifiedCusEntIdsByFeatureId?: Record<string, string[]>;
	usageWindowUpdates?: {
		internal_customer_id: string;
		feature_id: string;
		usage_windows: never[];
	}[];
} = {}) => ({
	customerId: "cus_1",
	orgId: "org_1",
	env: AppEnv.Sandbox,
	timestamp: 1,
	modifiedCusEntIdsByFeatureId,
	usageWindowUpdates,
});

describe("syncItemV4 attach-generation fencing", () => {
	beforeEach(() => {
		state.cacheReads = [];
		state.cacheMissing = false;
		state.executeCalls = 0;
		state.executeArgs = [];
		state.currentBalanceFields = {};
		state.currentUsageWindows = {};
		state.syncedIds = [];
		deleteCachedFullCustomer.mockClear();
	});

	test("keeps the ordinary cache-miss acknowledgement behavior", async () => {
		state.cacheMissing = true;
		const { ctx } = buildContext();

		await expect(
			syncItemV4({ ctx, payload: payload() }),
		).resolves.toBeUndefined();
		expect(state.executeCalls).toBe(0);
	});

	test("still persists payload-carried usage windows after a cache miss", async () => {
		state.cacheMissing = true;
		const { ctx } = buildContext();

		await expect(
			syncItemV4({
				ctx,
				payload: payload({
					usageWindowUpdates: [
						{
							internal_customer_id: "internal_customer_1",
							feature_id: "messages",
							usage_windows: [],
						},
					],
				}),
			}),
		).resolves.toBeUndefined();
		expect(state.executeCalls).toBe(1);
	});

	test("drops a retired balance after attach", async () => {
		const { ctx } = buildContext({ generations: ["1", "1"] });

		await expect(
			syncItemV4({ ctx, payload: payload() }),
		).resolves.toBeUndefined();
		expect(state.cacheReads).toEqual([]);
		expect(state.executeCalls).toBe(0);
	});

	test("still syncs an unrelated current balance from the same batch", async () => {
		state.currentBalanceFields.unrelated_entitlement = JSON.stringify({
			id: "unrelated_entitlement",
			feature_id: "messages",
			balance: 37,
			adjustment: 0,
			entities: null,
			next_reset_at: null,
			entity_count: 0,
			cache_version: 0,
			isEntityLevel: false,
			rollovers: [],
		});
		const { ctx } = buildContext({ generations: ["1", "1"] });

		await syncItemV4({
			ctx,
			payload: payload({
				modifiedCusEntIdsByFeatureId: {
					messages: ["retired_a", "unrelated_entitlement"],
				},
			}),
		});

		expect(state.syncedIds).toEqual(["unrelated_entitlement"]);
		expect(state.executeCalls).toBe(1);
	});

	test("uses the current Redis usage window after attach", async () => {
		state.currentUsageWindows.messages = JSON.stringify([
			{ id: "window_b", usage: 9 },
		]);
		const { ctx } = buildContext({ generations: ["1", "1"] });

		await syncItemV4({
			ctx,
			payload: payload({
				modifiedCusEntIdsByFeatureId: {},
				usageWindowUpdates: [
					{
						internal_customer_id: "internal_customer_1",
						feature_id: "messages",
						usage_windows: [],
					},
				],
			}),
		});

		const queryStrings = JSON.stringify(state.executeArgs[0]);
		expect(queryStrings).toContain("window_b");
		expect(state.executeCalls).toBe(1);
	});

	test("skips missing and malformed current usage windows", async () => {
		state.currentUsageWindows.messages = "not-json";
		const { ctx } = buildContext({ generations: ["1", "1"] });

		await syncItemV4({
			ctx,
			payload: payload({
				modifiedCusEntIdsByFeatureId: {},
				usageWindowUpdates: [
					{
						internal_customer_id: "internal_customer_1",
						feature_id: "messages",
						usage_windows: [],
					},
					{
						internal_customer_id: "internal_customer_1",
						feature_id: "emails",
						usage_windows: [],
					},
				],
			}),
		});

		expect(state.executeCalls).toBe(0);
	});

	test("retries when attach changes generation during Redis reads", async () => {
		const { ctx } = buildContext({ generations: ["1", "2"] });

		await expect(
			syncItemV4({ ctx, payload: payload() }),
		).rejects.toBeInstanceOf(RetryableBalanceSyncError);
		expect(state.executeCalls).toBe(0);
	});

	for (const conflict of [
		"CACHE_VERSION_MISMATCH cus_ent_id:cus_ent_1",
		"RESET_AT_MISMATCH cus_ent_id:cus_ent_1",
		"ENTITY_COUNT_MISMATCH cus_ent_id:cus_ent_1",
	]) {
		test(`keeps ordinary ${conflict.split(" ")[0]} invalidation`, async () => {
			const { ctx, deleteOwnedLock } = buildContext({
				postgresError: new Error(conflict),
			});

			await expect(
				syncItemV4({ ctx, payload: payload() }),
			).resolves.toBeUndefined();
			expect(deleteCachedFullCustomer).toHaveBeenCalledTimes(1);
			expect(deleteOwnedLock).toHaveBeenCalledTimes(1);
		});
	}

	test("retains a conflict while attach owns the handoff lock", async () => {
		const { ctx } = buildContext({
			lockResult: null,
			postgresError: new Error("CACHE_VERSION_MISMATCH cus_ent_id:cus_ent_1"),
		});

		await expect(
			syncItemV4({ ctx, payload: payload() }),
		).rejects.toBeInstanceOf(RetryableBalanceSyncError);
		expect(deleteCachedFullCustomer).not.toHaveBeenCalled();
	});

	test("does not invalidate B when the switch wins before lock acquisition", async () => {
		const { ctx, deleteOwnedLock } = buildContext({
			generations: [null, "1"],
			postgresError: new Error("CACHE_VERSION_MISMATCH cus_ent_id:cus_ent_1"),
		});

		await expect(
			syncItemV4({ ctx, payload: payload() }),
		).rejects.toBeInstanceOf(RetryableBalanceSyncError);
		expect(deleteCachedFullCustomer).not.toHaveBeenCalled();
		expect(deleteOwnedLock).toHaveBeenCalledTimes(1);
	});
});

afterAll(() => {
	mock.restore();
});
