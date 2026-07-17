/**
 * Regression coverage for an abandoned enable_plan_immediately checkout.
 *
 * Red: checkout expiry updates the customer product directly and leaves its
 * already-funded synthetic pooled balance behind.
 * Green: expiry sends the status update and idempotent source removal through
 * one Autumn billing plan, and a webhook retry emits the same safe removal.
 */

import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";

let checkoutCustomerProducts: FullCusProduct[] = [];
let executedPlans: AutumnBillingPlan[] = [];
let directCustomerProductUpdates = 0;
let metadataDeletes = 0;
let failNextPlan = false;

mock.module(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: async ({
			autumnBillingPlan,
		}: {
			autumnBillingPlan: AutumnBillingPlan;
		}) => {
			executedPlans.push(autumnBillingPlan);
			if (failNextPlan) {
				failNextPlan = false;
				throw new Error("transient pooled expiry failure");
			}
		},
	}),
);

mock.module("@/internal/customers/cusProducts/CusProductService", () => ({
	CusProductService: {
		getByStripeCheckoutSessionId: async () => checkoutCustomerProducts,
		update: async () => {
			directCustomerProductUpdates += 1;
		},
	},
}));

mock.module("@/internal/metadata/MetadataService", () => ({
	MetadataService: {
		delete: async () => {
			metadataDeletes += 1;
		},
	},
}));

const { handleStripeCheckoutSessionExpired } = await import(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionExpired/handleStripeCheckoutSessionExpired.js"
);

afterAll(() => {
	mock.restore();
});

const createPooledCheckoutCustomerProduct = (): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_checkout_pool",
		entitlementId: "entitlement_checkout_pool",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 0,
		customerProductId: "customer_product_checkout_pool",
		interval: EntInterval.Month,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	const customerProduct = customerProducts.create({
		id: "customer_product_checkout_pool",
		productId: "entity_pro_checkout_pool",
		customerEntitlements: [customerEntitlement],
		internalEntityId: "internal_entity_checkout_pool",
		entityId: "entity_checkout_pool",
		status: CusProductStatus.Active,
	});
	customerProduct.subscription_ids = [];
	return customerProduct;
};

const createContext = () =>
	({
		db: {},
		org: { id: "org_checkout_pool" },
		env: "sandbox",
		logger: { info: () => {} },
	}) as never;

const createExpiredEvent = () =>
	({
		data: {
			object: {
				id: "cs_checkout_pool",
				metadata: { autumn_metadata_id: "metadata_checkout_pool" },
			},
		},
	}) as never;

beforeEach(() => {
	checkoutCustomerProducts = [createPooledCheckoutCustomerProduct()];
	executedPlans = [];
	directCustomerProductUpdates = 0;
	metadataDeletes = 0;
	failNextPlan = false;
});

test("abandoned checkout expires the product and removes its pooled source in one plan", async () => {
	await handleStripeCheckoutSessionExpired({
		ctx: createContext(),
		event: createExpiredEvent(),
	});

	expect(directCustomerProductUpdates).toBe(0);
	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.updateCustomerProducts).toEqual([
		expect.objectContaining({
			customerProduct: checkoutCustomerProducts[0],
			updates: expect.objectContaining({ status: CusProductStatus.Expired }),
		}),
	]);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		{
			op: "remove_source",
			internalCustomerId: checkoutCustomerProducts[0]!.internal_customer_id,
			sourceCustomerProductId: checkoutCustomerProducts[0]!.id,
			effectiveAt: null,
		},
	]);
	expect(metadataDeletes).toBe(1);
});

test("checkout expiry retry re-emits the same idempotent pooled removal", async () => {
	failNextPlan = true;
	await expect(
		handleStripeCheckoutSessionExpired({
			ctx: createContext(),
			event: createExpiredEvent(),
		}),
	).rejects.toThrow("transient pooled expiry failure");
	expect(metadataDeletes).toBe(0);

	await handleStripeCheckoutSessionExpired({
		ctx: createContext(),
		event: createExpiredEvent(),
	});

	expect(executedPlans).toHaveLength(2);
	expect(executedPlans.map((plan) => plan.pooledBalanceOps)).toEqual([
		[
			{
				op: "remove_source",
				internalCustomerId: checkoutCustomerProducts[0]!.internal_customer_id,
				sourceCustomerProductId: checkoutCustomerProducts[0]!.id,
				effectiveAt: null,
			},
		],
		[
			{
				op: "remove_source",
				internalCustomerId: checkoutCustomerProducts[0]!.internal_customer_id,
				sourceCustomerProductId: checkoutCustomerProducts[0]!.id,
				effectiveAt: null,
			},
		],
	]);
	expect(metadataDeletes).toBe(1);
});
