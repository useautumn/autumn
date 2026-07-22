import { expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	type FullCusProduct,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
} from "@autumn/shared";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan.js";

type UpsertSourceOperation = Extract<PooledBalanceOp, { op: "upsert_source" }>;
type TransferSourceOperation = Extract<
	PooledBalanceOp,
	{ op: "transfer_source" }
>;
type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

const pooledOperation = ({
	sourceCustomerProductId,
	resetOwnerId,
	resetOwnerType = PooledBalanceResetOwnerType.Subscription,
}: {
	sourceCustomerProductId: string;
	resetOwnerId: string;
	resetOwnerType?: PooledBalanceResetOwnerType;
}): UpsertSourceOperation =>
	({
		op: "upsert_source",
		internalCustomerId: "internal_customer",
		sourceCustomerProductId,
		sourceEntitlementId: "entitlement",
		resetOwnerType,
		resetOwnerId,
	}) as UpsertSourceOperation;

const transferOperation = ({
	sourceCustomerProductId,
}: {
	sourceCustomerProductId: string;
}): TransferSourceOperation =>
	({
		op: "transfer_source",
		internalCustomerId: "internal_customer",
		sourceCustomerProductId,
		sourceEntitlementId: "entitlement",
		resetOwnerType: PooledBalanceResetOwnerType.Subscription,
		resetOwnerId: "temporary_transfer_owner",
		contributionId: "contribution",
		expectedPooledBalanceId: "pool",
	}) as TransferSourceOperation;

test("patched pooled sources receive the real Stripe subscription owner", () => {
	const customerProduct = { id: "patched_product" } as FullCusProduct;
	const patchedOperation = pooledOperation({
		sourceCustomerProductId: customerProduct.id,
		resetOwnerId: "temporary_owner",
	});
	const unrelatedOperation = pooledOperation({
		sourceCustomerProductId: "unrelated_product",
		resetOwnerId: "unrelated_owner",
	});
	const transferredOperation = transferOperation({
		sourceCustomerProductId: customerProduct.id,
	});
	const customerProductOwnedOperation = pooledOperation({
		sourceCustomerProductId: customerProduct.id,
		resetOwnerId: "customer_product_owner",
		resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
	});
	const update: CustomerProductUpdate = { customerProduct, updates: {} };
	const autumnBillingPlan = {
		customerId: "customer",
		insertCustomerProducts: [],
		updateCustomerProducts: [update],
		patchCustomerProducts: [
			{
				customerProduct,
				insertCustomerEntitlements: [],
				insertCustomerPrices: [],
				deleteCustomerEntitlements: [],
				deleteCustomerPrices: [],
			},
		],
		pooledBalanceOps: [
			patchedOperation,
			transferredOperation,
			unrelatedOperation,
			customerProductOwnedOperation,
		],
	} satisfies AutumnBillingPlan;

	addStripeSubscriptionIdToBillingPlan({
		autumnBillingPlan,
		stripeSubscriptionId: "sub_real",
	});

	expect(update.updates.subscription_ids).toEqual(["sub_real"]);
	expect(patchedOperation.resetOwnerId).toBe("sub_real");
	expect(transferredOperation.resetOwnerId).toBe("sub_real");
	expect(unrelatedOperation.resetOwnerId).toBe("unrelated_owner");
	expect(customerProductOwnedOperation.resetOwnerId).toBe(
		"customer_product_owner",
	);
});
