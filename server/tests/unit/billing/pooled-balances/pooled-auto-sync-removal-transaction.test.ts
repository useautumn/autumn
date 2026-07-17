import { expect, test } from "bun:test";
import { CusProductStatus, EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { expireRemovedCustomerProducts } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/autoSyncUpdatedSubscription.js";

const createPooledCustomerProduct = () => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_messages",
		entitlementId: "entitlement_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 0,
		customerProductId: "customer_product_pooled",
		interval: EntInterval.Month,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	return customerProducts.create({
		id: "customer_product_pooled",
		customerEntitlements: [customerEntitlement],
		internalEntityId: "internal_entity_one",
		entityId: "entity_one",
	});
};

test("Stripe auto-sync expires the product and removes its pooled source in one plan", async () => {
	const customerProduct = createPooledCustomerProduct();
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	let trackedUpdates = 0;

	await expireRemovedCustomerProducts({
		ctx: contexts.create({}) as never,
		subscriptionUpdatedContext: { fullCustomer } as never,
		removedCustomerProducts: [customerProduct],
		nowMs: Date.UTC(2027, 0, 1),
		dependencies: {
			executeAutumnBillingPlan: async ({ autumnBillingPlan }) => {
				expect(autumnBillingPlan.updateCustomerProducts).toEqual([
					expect.objectContaining({
						customerProduct,
						updates: expect.objectContaining({
							status: CusProductStatus.Expired,
						}),
					}),
				]);
				expect(autumnBillingPlan.pooledBalanceOps).toEqual([
					expect.objectContaining({
						op: "remove_source",
						sourceCustomerProductId: customerProduct.id,
					}),
				]);
			},
			trackCustomerProductUpdate: ({ customerProduct }) => {
				trackedUpdates += 1;
				return customerProduct;
			},
		},
	});

	expect(trackedUpdates).toBe(1);
});

test("Stripe auto-sync records no lifecycle side effects when the merged plan fails", async () => {
	const customerProduct = createPooledCustomerProduct();
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	let trackedUpdates = 0;

	await expect(
		expireRemovedCustomerProducts({
			ctx: contexts.create({}) as never,
			subscriptionUpdatedContext: { fullCustomer } as never,
			removedCustomerProducts: [customerProduct],
			dependencies: {
				executeAutumnBillingPlan: async () => {
					throw new Error("synthetic transaction failure");
				},
				trackCustomerProductUpdate: ({ customerProduct }) => {
					trackedUpdates += 1;
					return customerProduct;
				},
			},
		}),
	).rejects.toThrow("synthetic transaction failure");

	expect(trackedUpdates).toBe(0);
});
