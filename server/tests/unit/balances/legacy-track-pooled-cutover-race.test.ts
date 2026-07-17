import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { executeLegacyRedisDeductionWithBalanceSyncWithDependencies } from "@/internal/balances/utils/deduction/executeLegacyRedisDeductionWithBalanceSync.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

const legacyDeductionResult = ({ balance }: { balance: number }) => ({
	oldFullCus: {},
	fullCus: {},
	updates: {
		customer_entitlement_1: {
			balance,
			additional_balance: 0,
			entities: {},
			adjustment: 0,
			deducted: 100,
		},
	},
	rolloverUpdates: {},
	mutationLogs: [],
});

test("an acknowledged legacy track is durable before pooled cutover invalidates its cache", async () => {
	const allowTrackFlush = deferred();
	const trackReachedFlush = deferred();
	let releasePreviousTransaction = Promise.resolve();
	let cacheBalance: number | null = 500;
	let databaseBalance = 500;
	let databaseBalanceObservedByCutover: number | undefined;
	const events: string[] = [];

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			const waitForPrevious = releasePreviousTransaction;
			const releaseCurrent = deferred();
			releasePreviousTransaction = releaseCurrent.promise;
			let lockAcquired = false;

			try {
				return await callback({
					execute: async () => {
						if (!lockAcquired) {
							await waitForPrevious;
							lockAcquired = true;
						}
						return [];
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
		db,
	};
	const fullCustomer = {
		id: "public_customer_1",
		internal_id: "internal_customer_1",
	};

	const track = executeLegacyRedisDeductionWithBalanceSyncWithDependencies({
		ctx: ctx as never,
		fullCustomer: fullCustomer as never,
		featureDeductions: [],
		overageBehavior: "cap",
		dependencies: {
			executeRedisDeduction: async () => {
				cacheBalance = (cacheBalance ?? databaseBalance) - 100;
				events.push("track:redis");
				return legacyDeductionResult({ balance: cacheBalance }) as never;
			},
			writeFullCustomerBalancesToDb: async () => {
				events.push("track:flush-start");
				trackReachedFlush.resolve();
				await allowTrackFlush.promise;
				databaseBalance = cacheBalance ?? databaseBalance;
				events.push("track:flush-done");
			},
			invalidateLegacyCache: async () => {
				cacheBalance = null;
			},
		} as never,
	});
	await trackReachedFlush.promise;

	const pooledCutover = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: fullCustomer.id,
		internalCustomerId: fullCustomer.internal_id,
		callback: async () => {
			events.push("pooled:cutover");
			databaseBalanceObservedByCutover = databaseBalance;
			cacheBalance = null;
		},
	});
	await Promise.resolve();
	await Promise.resolve();

	expect(events).toEqual(["track:redis", "track:flush-start"]);
	allowTrackFlush.resolve();
	await track;
	events.push("track:acknowledged");
	await pooledCutover;

	expect(databaseBalance).toBe(400);
	expect(databaseBalanceObservedByCutover).toBe(400);
	expect(cacheBalance).toBeNull();
	expect(events.slice(0, 3)).toEqual([
		"track:redis",
		"track:flush-start",
		"track:flush-done",
	]);
	expect(new Set(events.slice(3))).toEqual(
		new Set(["pooled:cutover", "track:acknowledged"]),
	);
});

test("a failed legacy sync invalidates Redis so retry rebuilds without double deduction", async () => {
	let cacheBalance: number | null = 500;
	let databaseBalance = 500;
	let failNextCommit = true;
	let invalidationCount = 0;

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			const databaseBalanceBeforeTransaction = databaseBalance;
			const result = await callback({ execute: async () => [] });
			if (failNextCommit) {
				failNextCommit = false;
				databaseBalance = databaseBalanceBeforeTransaction;
				throw new Error("legacy sync commit failed");
			}
			return result;
		},
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};
	const fullCustomer = {
		id: "public_customer_1",
		internal_id: "internal_customer_1",
	};
	const executeTrack = () =>
		executeLegacyRedisDeductionWithBalanceSyncWithDependencies({
			ctx: ctx as never,
			fullCustomer: fullCustomer as never,
			featureDeductions: [],
			overageBehavior: "cap",
			dependencies: {
				executeRedisDeduction: async () => {
					cacheBalance = (cacheBalance ?? databaseBalance) - 100;
					return legacyDeductionResult({ balance: cacheBalance }) as never;
				},
				writeFullCustomerBalancesToDb: async () => {
					databaseBalance = cacheBalance ?? databaseBalance;
				},
				invalidateLegacyCache: async () => {
					invalidationCount += 1;
					cacheBalance = null;
				},
			} as never,
		});

	await expect(executeTrack()).rejects.toThrow("legacy sync commit failed");
	expect(databaseBalance).toBe(500);
	expect(cacheBalance).toBeNull();
	expect(invalidationCount).toBe(1);

	await executeTrack();
	expect(databaseBalance).toBe(400);
	expect(cacheBalance).toBe(400);
	expect(invalidationCount).toBe(1);
});

for (const conflictCode of [
	"RESET_AT_MISMATCH",
	"ENTITY_COUNT_MISMATCH",
	"CACHE_VERSION_MISMATCH",
] as const) {
	test(`an acknowledged legacy deduction returns its Redis result after ${conflictCode}`, async () => {
		let invalidationCount = 0;
		const expectedResult = legacyDeductionResult({ balance: 400 });
		const ctx = {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			db: {
				transaction: async <T>(
					callback: (transaction: {
						execute: () => Promise<unknown[]>;
					}) => Promise<T>,
				) => callback({ execute: async () => [] }),
			},
		};

		const result =
			await executeLegacyRedisDeductionWithBalanceSyncWithDependencies({
				ctx: ctx as never,
				fullCustomer: {
					id: "public_customer_1",
					internal_id: "internal_customer_1",
				} as never,
				featureDeductions: [],
				dependencies: {
					executeRedisDeduction: async () => expectedResult as never,
					writeFullCustomerBalancesToDb: async () => {
						throw new Error(
							`${conflictCode} cus_ent_id:customer_entitlement_1`,
						);
					},
					invalidateLegacyCache: async () => {
						invalidationCount += 1;
					},
				} as never,
			});

		expect(result.updates.customer_entitlement_1?.balance).toBe(400);
		expect(invalidationCount).toBe(1);
	});
}
