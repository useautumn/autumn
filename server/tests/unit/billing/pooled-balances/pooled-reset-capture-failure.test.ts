import { expect, test } from "bun:test";
import { EntInterval, type FullCusEntWithFullCusProduct } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import {
	resetPooledBalancesByResetOwnerWithDependencies,
	resetPooledCustomerEntitlementsWithDependencies,
} from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";

const createTransactionContext = () => {
	const events: string[] = [];
	const transaction = {
		execute: async () => {
			events.push("advisory-lock");
			return [];
		},
	};
	return {
		events,
		ctx: {
			org: { id: "org_1" },
			env: "sandbox",
			db: {
				transaction: async <T>(
					callback: (lockedDb: typeof transaction) => Promise<T>,
				) => callback(transaction),
			},
		},
	};
};

test("subscription reset rolls back before reset work when strict capture fails", async () => {
	const { ctx, events } = createTransactionContext();
	const captureError = new Error("capture failed");

	await expect(
		resetPooledBalancesByResetOwnerWithDependencies({
			ctx: ctx as never,
			customerId: "customer_1",
			internalCustomerId: "internal_customer_1",
			resetOwnerType: "subscription" as never,
			resetOwnerId: "sub_1",
			now: 2,
			dependencies: {
				listPools: async () => [{ id: "pool_1" }] as never,
				lockCustomer: async () => {
					events.push("customer-lock");
				},
				invalidateCachedSubject: async (params: {
					balanceCaptureMode?: string;
				}) => {
					events.push(`capture:${params.balanceCaptureMode}`);
					throw captureError;
				},
				resetPool: async () => {
					events.push("reset");
					return null;
				},
				invalidateCachesAfterFailure: async ({
					flushBalances,
				}: {
					flushBalances?: boolean;
				}) => {
					events.push(`failure-invalidation:${flushBalances}`);
				},
			} as never,
		}),
	).rejects.toBe(captureError);

	expect(events).toEqual([
		"advisory-lock",
		"customer-lock",
		"capture:strict",
		"failure-invalidation:true",
	]);
});

test("lazy reset flushes strictly before reset work and invalidates on capture failure", async () => {
	const { ctx, events } = createTransactionContext();
	const baseCustomerEntitlement = customerEntitlements.create({
		id: "cus_ent_pool",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 400,
		interval: EntInterval.Month,
		nextResetAt: 1,
	});
	const pooledCustomerEntitlement = {
		...baseCustomerEntitlement,
		customer_product_id: null,
		customer_product: null,
		entitlement: { ...baseCustomerEntitlement.entitlement, pooled: true },
	} as FullCusEntWithFullCusProduct;
	const captureError = new Error("capture failed");

	await expect(
		resetPooledCustomerEntitlementsWithDependencies({
			ctx: ctx as never,
			customerId: "customer_1",
			customerEntitlements: [pooledCustomerEntitlement],
			now: 2,
			dependencies: {
				lockCustomer: async () => {
					events.push("customer-lock");
				},
				invalidateCachedSubject: async (params: {
					balanceCaptureMode?: string;
				}) => {
					events.push(`capture:${params.balanceCaptureMode}`);
					throw captureError;
				},
				resetCustomerEntitlement: async () => {
					events.push("reset");
					return null;
				},
				invalidateCachesAfterFailure: async ({
					flushBalances,
				}: {
					flushBalances?: boolean;
				}) => {
					events.push(`failure-invalidation:${flushBalances}`);
				},
			} as never,
		}),
	).rejects.toBe(captureError);

	expect(events).toEqual([
		"advisory-lock",
		"customer-lock",
		"capture:strict",
		"failure-invalidation:true",
	]);
});
