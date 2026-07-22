/**
 * Pooled database work stays inside the customer transaction, while its prepared Redis cutover runs only after commit.
 * This ordering prevents a failed commit from invalidating a track that consumed a prematurely published cache state.
 */
import { expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	ExecutePooledBalanceOpsDependencies,
	ExecutePooledBalanceTransfersDependencies,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import {
	executePooledBalanceOpsWithDependencies,
	executePooledBalanceTransfersWithDependencies,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";

test("publishes the prepared pooled cache cutover only after the customer transaction commits", async () => {
	const events: string[] = [];
	let transactionOpen = false;
	const preparedCutover = { marker: "prepared cutover" };

	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
		}) => {
			transactionOpen = true;
			const result = await callback({ db: {} });
			events.push("postgres commit");
			transactionOpen = false;
			return result;
		},
		executeWithLock: async () => {
			expect(transactionOpen).toBe(true);
			events.push("database mutations");
			return preparedCutover;
		},
		applyCacheCutover: async ({
			prepared,
		}: {
			prepared: typeof preparedCutover;
		}) => {
			expect(transactionOpen).toBe(false);
			expect(prepared).toBe(preparedCutover);
			events.push("redis cache cutover");
		},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	await executePooledBalanceOpsWithDependencies({
		ctx: {
			db: {} as never,
			org: { id: "org_one" },
			env: "test",
		} as unknown as AutumnContext,
		customerId: "customer_one",
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_one",
				sourceCustomerProductId: "source_one",
				effectiveAt: null,
			},
		],
		dependencies,
	});

	expect(events).toEqual([
		"database mutations",
		"postgres commit",
		"redis cache cutover",
	]);
});

test("a failed commit neither publishes a prepared cutover nor deletes a concurrent track", async () => {
	let cacheBalance: number | null = 500;
	let cutoverCount = 0;
	let invalidationCount = 0;
	const preparedCutover = { marker: "prepared cutover" };
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
			onTransactionFailure,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
			onTransactionFailure?: ({ error }: { error: unknown }) => Promise<void>;
		}) => {
			await callback({ db: {} });
			cacheBalance = (cacheBalance ?? 0) - 100;
			const error = new Error("commit failed after callback");
			await onTransactionFailure?.({ error });
			throw error;
		},
		executeWithLock: async () => preparedCutover,
		applyCacheCutover: async () => {
			cutoverCount += 1;
			cacheBalance = 1000;
		},
		invalidateCachesAfterFailure: async () => {
			invalidationCount += 1;
			cacheBalance = null;
		},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	await expect(
		executePooledBalanceOpsWithDependencies({
			ctx: {
				db: {} as never,
				org: { id: "org_one" },
				env: "test",
			} as unknown as AutumnContext,
			customerId: "customer_one",
			pooledBalanceOps: [
				{
					op: "remove_source",
					internalCustomerId: "internal_customer_one",
					sourceCustomerProductId: "source_one",
					effectiveAt: null,
				},
			],
			dependencies,
		}),
	).rejects.toThrow("commit failed after callback");

	expect(cacheBalance).toBe(400);
	expect(cutoverCount).toBe(0);
	expect(invalidationCount).toBe(0);
});

test("publishes a prepared transfer cutover only after its customer transaction commits", async () => {
	const events: string[] = [];
	let transactionOpen = false;
	const preparedCutover = { marker: "prepared transfer cutover" };
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
		}) => {
			transactionOpen = true;
			const result = await callback({ db: {} });
			events.push("postgres commit");
			transactionOpen = false;
			return result;
		},
		executeWithLock: async () => {
			expect(transactionOpen).toBe(true);
			events.push("transfer database mutations");
			return {
				featureIds: ["messages"],
				preparedCutover,
			};
		},
		applyCacheCutover: async ({
			prepared,
		}: {
			prepared: typeof preparedCutover;
		}) => {
			expect(transactionOpen).toBe(false);
			expect(prepared).toBe(preparedCutover);
			events.push("redis transfer cutover");
		},
	} as unknown as ExecutePooledBalanceTransfersDependencies;

	const featureIds = await executePooledBalanceTransfersWithDependencies({
		ctx: {
			db: {} as never,
			org: { id: "org_one" },
			env: "test",
		} as unknown as AutumnContext,
		customerId: "customer_one",
		internalCustomerId: "internal_customer_one",
		operations: [],
		dependencies,
	});

	expect(featureIds).toEqual(["messages"]);
	expect(events).toEqual([
		"transfer database mutations",
		"postgres commit",
		"redis transfer cutover",
	]);
});
