import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { computeFieldUpdatePooledBalanceOps } from "@/internal/billing/v2/actions/updateSubscription/compute/computeFieldUpdates.js";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js";

const NOW = Date.UTC(2027, 0, 1);

const createSource = ({
	status = CusProductStatus.Active,
	paid = false,
	entityAttached = true,
}: {
	status?: CusProductStatus;
	paid?: boolean;
	entityAttached?: boolean;
} = {}): FullCusProduct => {
	const pooledEntitlement = {
		...entitlements.create({
			id: "entitlement_messages",
			featureId: "messages",
			featureName: "Messages",
			allowance: 500,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};
	const fixedPrice = paid ? prices.createFixed({ id: "fixed_monthly" }) : null;
	const product = products.createFull({
		id: "pooled_product",
		entitlements: [pooledEntitlement],
		prices: fixedPrice ? [fixedPrice] : [],
	});
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_messages",
		entitlementId: pooledEntitlement.id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: entityAttached ? 0 : 500,
		customerProductId: "customer_product_source",
		interval: EntInterval.Month,
		nextResetAt: Date.UTC(2027, 1, 1),
	});
	customerEntitlement.entitlement = pooledEntitlement;
	customerEntitlement.reset_cycle_anchor = NOW;

	return customerProducts.create({
		id: "customer_product_source",
		productId: product.id,
		product,
		customerEntitlements: [customerEntitlement],
		customerPrices: fixedPrice
			? [prices.createCustomer({ price: fixedPrice })]
			: [],
		subscriptionIds: paid ? ["subscription_old"] : [],
		internalEntityId: entityAttached ? "internal_entity_one" : undefined,
		entityId: entityAttached ? "entity_one" : undefined,
		status,
		startsAt: NOW,
	});
};

const createBillingContext = (
	customerProduct: FullCusProduct,
): UpdateSubscriptionBillingContext =>
	({
		customerProduct,
		fullCustomer: customers.create({ customerProducts: [customerProduct] }),
		currentEpochMs: NOW,
		requestedBillingCycleAnchor: undefined,
		skipBillingChanges: true,
	}) as UpdateSubscriptionBillingContext;

describe("pooled direct subscription field updates", () => {
	test("status Expired removes a live pooled source", () => {
		const customerProduct = createSource();
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				status: CusProductStatus.Expired,
			},
		});

		expect(operations).toEqual([
			expect.objectContaining({
				op: "remove_source",
				sourceCustomerProductId: customerProduct.id,
				effectiveAt: null,
			}),
		]);
	});

	test("status Active restores a paused pooled source through an idempotent upsert", () => {
		const customerProduct = createSource({ status: CusProductStatus.Paused });
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				status: CusProductStatus.Active,
			},
		});

		expect(operations).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				sourceCustomerProductId: customerProduct.id,
				currentCycleContribution: 500,
			}),
		]);
	});

	test("status Paused removes a live pooled source", () => {
		const customerProduct = createSource();
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				status: CusProductStatus.Paused as never,
			},
		});

		expect(operations).toEqual([
			expect.objectContaining({
				op: "remove_source",
				sourceCustomerProductId: customerProduct.id,
				effectiveAt: null,
			}),
		]);
	});

	test("processor subscription relink updates the pooled reset-owner provenance", () => {
		const customerProduct = createSource({ paid: true });
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				processor_subscription_id: "subscription_new",
			},
		});

		expect(operations).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				resetOwnerType: "subscription",
				resetOwnerId: "subscription_new",
			}),
		]);
	});

	test("clearing the processor subscription removes the paid pooled source", () => {
		const customerProduct = createSource({ paid: true });
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				processor_subscription_id: null,
			},
		});

		expect(operations).toEqual([
			expect.objectContaining({
				op: "remove_source",
				sourceCustomerProductId: customerProduct.id,
				effectiveAt: null,
			}),
		]);
	});

	test("customer-level pooled catalog items keep ordinary field-update behavior", () => {
		const customerProduct = createSource({ entityAttached: false });
		const operations = computeFieldUpdatePooledBalanceOps({
			billingContext: createBillingContext(customerProduct),
			params: {
				customer_id: "cus_test",
				status: CusProductStatus.Expired,
			},
		});

		expect(operations).toEqual([]);
	});

	test("the update plan executes the status change and pooled removal together", async () => {
		const customerProduct = createSource();
		const billingContext = {
			...createBillingContext(customerProduct),
			intent: UpdateSubscriptionIntent.None,
		} as UpdateSubscriptionBillingContext;

		const plan = await computeUpdateSubscriptionPlan({
			ctx: contexts.create({}),
			billingContext,
			params: {
				customer_id: "cus_test",
				status: CusProductStatus.Expired,
			},
		});

		expect(plan.updateCustomerProduct?.updates.status).toBe(
			CusProductStatus.Expired,
		);
		expect(plan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "remove_source",
				sourceCustomerProductId: customerProduct.id,
			}),
		]);
	});

	test("the update plan persists a processor relink with the new pooled owner", async () => {
		const customerProduct = createSource({ paid: true });
		const billingContext = {
			...createBillingContext(customerProduct),
			intent: UpdateSubscriptionIntent.None,
		} as UpdateSubscriptionBillingContext;

		const plan = await computeUpdateSubscriptionPlan({
			ctx: contexts.create({}),
			billingContext,
			params: {
				customer_id: "cus_test",
				processor_subscription_id: "subscription_new",
			},
		});

		expect(plan.updateCustomerProduct?.updates.subscription_ids).toEqual([
			"subscription_new",
		]);
		expect(plan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				resetOwnerId: "subscription_new",
			}),
		]);
	});
});
