import { expect, test } from "bun:test";
import { PooledBalanceResetOwnerType } from "@autumn/shared";
import {
	type ExecutePooledBalanceOpsDependencies,
	executePooledBalanceOpsWithDependencies,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import {
	type ResetPooledBalancesByOwnerDependencies,
	resetPooledBalancesByResetOwnerWithDependencies,
} from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";

test("pooled contribution operations reuse an existing customer balance-sync transaction", async () => {
	const balanceSyncDb = {};
	let executeCalls = 0;

	await executePooledBalanceOpsWithDependencies({
		ctx: { db: {} } as never,
		customerId: "customer_one",
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_one",
				sourceCustomerProductId: "source_one",
				effectiveAt: null,
			},
		],
		balanceSyncDb: balanceSyncDb as never,
		dependencies: {
			withCustomerBalanceSyncLock: async () => {
				throw new Error("nested customer balance-sync transaction");
			},
			executeWithLock: async ({
				ctx,
			}: Parameters<
				ExecutePooledBalanceOpsDependencies["executeWithLock"]
			>[0]) => {
				expect(ctx.db as unknown).toBe(balanceSyncDb);
				executeCalls += 1;
			},
		} as unknown as ExecutePooledBalanceOpsDependencies,
	});

	expect(executeCalls).toBe(1);
});

test("subscription-owned resets reuse an existing customer balance-sync transaction", async () => {
	const balanceSyncDb = {};
	const events: string[] = [];
	const dependencies = {
		listPools: async ({ db }: { db: unknown }) => {
			expect(db).toBe(balanceSyncDb);
			events.push("list pools");
			return [{ id: "pool_one" }];
		},
		lockCustomer: async ({ db }: { db: unknown }) => {
			expect(db).toBe(balanceSyncDb);
			events.push("lock customer row");
		},
		invalidateCachedSubject: async ({
			balanceSyncDb: receivedDb,
		}: {
			balanceSyncDb: unknown;
		}) => {
			expect(receivedDb).toBe(balanceSyncDb);
			events.push("capture cache");
		},
		resetPool: async ({
			balanceSyncDb: receivedDb,
		}: {
			balanceSyncDb: unknown;
		}) => {
			expect(receivedDb).toBe(balanceSyncDb);
			events.push("reset pool");
			return null;
		},
	} as unknown as ResetPooledBalancesByOwnerDependencies;

	await resetPooledBalancesByResetOwnerWithDependencies({
		ctx: { db: {} } as never,
		customerId: "customer_one",
		internalCustomerId: "internal_customer_one",
		resetOwnerType: PooledBalanceResetOwnerType.Subscription,
		resetOwnerId: "subscription_one",
		now: 1_000,
		balanceSyncDb: balanceSyncDb as never,
		dependencies,
	});

	expect(events).toEqual([
		"list pools",
		"lock customer row",
		"capture cache",
		"reset pool",
	]);
});
