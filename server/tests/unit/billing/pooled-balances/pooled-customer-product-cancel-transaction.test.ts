import { expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { cancelCustomerProduct } from "@/internal/customers/cusProducts/actions/cancelCustomerProduct.js";
import { uncancelCustomerProduct } from "@/internal/customers/cusProducts/actions/uncancelCustomerProduct.js";

const buildPooledCustomerProduct = ({
	canceled = false,
	endedAt = null,
}: {
	canceled?: boolean;
	endedAt?: number | null;
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_1",
		entitlementId: "entitlement_1",
		featureId: "messages",
		internalFeatureId: "internal_messages",
		featureName: "Messages",
		allowance: 500,
		balance: 0,
		customerProductId: "customer_product_1",
		interval: EntInterval.Month,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	const customerProduct = customerProducts.create({
		id: "customer_product_1",
		productId: "product_1",
		internalEntityId: "internal_entity_1",
		customerEntitlements: [customerEntitlement],
		status: CusProductStatus.Active,
		startsAt: 1_800_000_000_000,
	});
	customerProduct.canceled = canceled;
	customerProduct.ended_at = endedAt;
	return customerProduct;
};

test("pooled cancellation writes product state and staged removal in one plan", async () => {
	const customerProduct = buildPooledCustomerProduct({});
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	let directUpdateCalls = 0;
	let planCalls = 0;
	let webhookCalls = 0;

	await cancelCustomerProduct({
		ctx: contexts.create({}),
		customerProduct,
		fullCustomer,
		endedAt: 1_900_000_000_000,
		dependencies: {
			executeAutumnBillingPlan: async ({ autumnBillingPlan }) => {
				planCalls += 1;
				expect(autumnBillingPlan.updateCustomerProducts).toEqual([
					expect.objectContaining({
						customerProduct,
						updates: expect.objectContaining({
							canceled: true,
							ended_at: 1_900_000_000_000,
						}),
					}),
				]);
				expect(autumnBillingPlan.pooledBalanceOps).toEqual([
					expect.objectContaining({
						op: "remove_source",
						effectiveAt: 1_900_000_000_000,
					}),
					expect.objectContaining({
						op: "stage_owner_removal",
						effectiveAt: 1_900_000_000_000,
					}),
				]);
			},
			updateCustomerProduct: async () => {
				directUpdateCalls += 1;
				return [] as never;
			},
			addProductsUpdatedWebhookTask: async () => {
				webhookCalls += 1;
			},
		},
	});

	expect({ planCalls, directUpdateCalls, webhookCalls }).toEqual({
		planCalls: 1,
		directUpdateCalls: 0,
		webhookCalls: 1,
	});
});

test("pooled uncancel writes product state and restores the contribution in one plan", async () => {
	const endedAt = 1_900_000_000_000;
	const customerProduct = buildPooledCustomerProduct({
		canceled: true,
		endedAt,
	});
	const fullCustomer = customers.create({
		customerProducts: [customerProduct],
	});
	let directUpdateCalls = 0;
	let planCalls = 0;

	await uncancelCustomerProduct({
		ctx: contexts.create({}),
		customerProduct,
		fullCustomer,
		dependencies: {
			executeAutumnBillingPlan: async ({ autumnBillingPlan }) => {
				planCalls += 1;
				expect(autumnBillingPlan.updateCustomerProducts).toEqual([
					expect.objectContaining({
						customerProduct,
						updates: expect.objectContaining({
							canceled: false,
							ended_at: null,
						}),
					}),
				]);
				expect(autumnBillingPlan.pooledBalanceOps).toEqual([
					expect.objectContaining({
						op: "restore_source",
						expectedEffectiveAt: endedAt,
					}),
					expect.objectContaining({
						op: "restore_owner",
						expectedEffectiveAt: endedAt,
					}),
				]);
			},
			updateCustomerProduct: async () => {
				directUpdateCalls += 1;
				return [] as never;
			},
			addProductsUpdatedWebhookTask: async () => {},
		},
	});

	expect({ planCalls, directUpdateCalls }).toEqual({
		planCalls: 1,
		directUpdateCalls: 0,
	});
});
