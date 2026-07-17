import { describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { syncItemV4WithDependencies } from "@/internal/balances/utils/sync/syncItemV4.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";

const mockState = {
	cacheReads: [] as string[],
	executeCalls: [] as unknown[],
	balance: 42,
	afterCacheRead: undefined as undefined | (() => void),
};

const getFeatureBalance = async ({ featureId }: { featureId: string }) => {
	mockState.cacheReads.push(featureId);
	if (featureId === "missing_feature") {
		return { kind: "missing" as const, reason: "single_field_null" };
	}
	mockState.afterCacheRead?.();

	return {
		kind: "ok" as const,
		value: {
			featureId,
			balances: [
				{
					id: "cus_ent_present",
					feature_id: featureId,
					balance: mockState.balance,
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
};

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

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
				transaction: async (
					callback: (transaction: {
						query: {
							customers: {
								findFirst: () => Promise<{ internal_id: string }>;
							};
						};
						execute: (query: unknown) => Promise<unknown[]>;
					}) => Promise<unknown>,
				) => {
					let executeCount = 0;
					return callback({
						query: {
							customers: {
								findFirst: async () => ({ internal_id: "internal_cus_1" }),
							},
						},
						execute: mock(async (query: unknown) => {
							executeCount += 1;
							if (executeCount === 1) return [];
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
					});
				},
			},
		};

		await syncItemV4WithDependencies({
			ctx: ctx as never,
			getFeatureBalance: getFeatureBalance as never,
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

	test("a delayed sync cannot overwrite a newer lifecycle cutover", async () => {
		const syncRead = deferred();
		const releaseSyncWrite = deferred();
		let releasePreviousTransaction = Promise.resolve();
		let transactionIndex = 0;
		let lastReadBalance = 0;
		let databaseBalance = 500;
		const events: string[] = [];
		mockState.balance = 500;
		mockState.afterCacheRead = () => {
			lastReadBalance = mockState.balance;
			events.push("sync:read");
			syncRead.resolve();
		};

		const db = {
			transaction: async <T>(
				callback: (transaction: {
					query: {
						customers: {
							findFirst: () => Promise<{ internal_id: string }>;
						};
					};
					execute: () => Promise<unknown[]>;
				}) => Promise<T>,
			) => {
				transactionIndex += 1;
				const currentTransactionIndex = transactionIndex;
				const waitForPrevious = releasePreviousTransaction;
				const releaseCurrent = deferred();
				releasePreviousTransaction = releaseCurrent.promise;
				let executeCount = 0;

				try {
					return await callback({
						query: {
							customers: {
								findFirst: async () => ({
									internal_id: "internal_cus_race",
								}),
							},
						},
						execute: async () => {
							executeCount += 1;
							if (executeCount === 1) {
								await waitForPrevious;
								return [];
							}
							if (currentTransactionIndex === 1) {
								await releaseSyncWrite.promise;
								databaseBalance = lastReadBalance;
								events.push("sync:write");
							}
							return [
								{
									sync_balances_v2: {
										updates: { cus_ent_present: {} },
										rollover_updates: {},
									},
								},
							];
						},
					});
				} finally {
					releaseCurrent.resolve();
				}
			},
		};
		const ctx = {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			features: [],
			extraLogs: {},
			logger: { warn: mock(() => {}) },
			db,
		};

		const staleSync = syncItemV4WithDependencies({
			ctx: ctx as never,
			getFeatureBalance: getFeatureBalance as never,
			payload: {
				customerId: "cus_race",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				timestamp: 1,
				modifiedCusEntIdsByFeatureId: {
					present_feature: ["cus_ent_present"],
				},
			},
		});
		await syncRead.promise;

		const lifecycleCutover = withCustomerBalanceSyncLock({
			ctx: ctx as never,
			customerId: "cus_race",
			internalCustomerId: "internal_cus_race",
			callback: async () => {
				events.push("lifecycle:start");
				databaseBalance -= 100;
				mockState.balance -= 100;
				databaseBalance = mockState.balance;
				events.push("lifecycle:write");
			},
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(events).toEqual(["sync:read"]);

		releaseSyncWrite.resolve();
		await Promise.all([staleSync, lifecycleCutover]);

		expect(events).toEqual([
			"sync:read",
			"sync:write",
			"lifecycle:start",
			"lifecycle:write",
		]);
		expect(databaseBalance).toBe(400);
		expect(mockState.balance).toBe(400);
		mockState.afterCacheRead = undefined;
	});
});
