import { describe, expect, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { computePooledQuantityUpdateOps } from "@/internal/billing/v2/pooledBalances/compute/computePooledQuantityUpdateOps.js";

const createPooledPrepaidCustomerProduct = ({
	interval,
	entityAttached = true,
}: {
	interval: EntInterval;
	entityAttached?: boolean;
}) => {
	const entitlementId = "entitlement-pooled-messages";
	const customerProductId = "customer-product-pooled-messages";
	const customerEntitlement = customerEntitlements.create({
		id: "customer-entitlement-pooled-messages",
		entitlementId,
		featureId: "messages",
		featureName: "Messages",
		allowance: 50,
		balance: 0,
		customerProductId,
		interval,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};
	const price = prices.createPrepaid({
		id: "price-pooled-messages",
		featureId: "messages",
		billingUnits: 10,
		entitlementId,
	});

	return customerProducts.create({
		id: customerProductId,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price, customerProductId })],
		internalEntityId: entityAttached ? "internal-entity-one" : undefined,
		entityId: entityAttached ? "entity-one" : undefined,
		subscriptionIds: ["subscription-one"],
	});
};

describe("computePooledQuantityUpdateOps", () => {
	test("uses the shared starting-balance calculation for current and upcoming quantities", () => {
		const customerProduct = createPooledPrepaidCustomerProduct({
			interval: EntInterval.Month,
		});
		customerProduct.customer_entitlements[0]!.reset_cycle_anchor = 1_000;
		customerProduct.customer_entitlements[0]!.next_reset_at = 2_000;

		expect(
			computePooledQuantityUpdateOps({
				customerProduct,
				updatedOptions: [
					{
						feature_id: "messages",
						internal_feature_id: "internal_messages",
						quantity: 4,
						upcoming_quantity: 7,
					},
				],
			}),
		).toEqual([
			expect.objectContaining({
				currentCycleContribution: 90,
				nextCycleContribution: 120,
			}),
		]);
	});

	test("lifetime prepaid contributions do not require reset metadata", () => {
		const customerProduct = createPooledPrepaidCustomerProduct({
			interval: EntInterval.Lifetime,
		});

		expect(
			computePooledQuantityUpdateOps({
				customerProduct,
				updatedOptions: [
					{
						feature_id: "messages",
						internal_feature_id: "internal_messages",
						quantity: 4,
					},
				],
			}),
		).toEqual([
			expect.objectContaining({
				interval: EntInterval.Lifetime,
				resetCycleAnchor: null,
				nextResetAt: null,
				currentCycleContribution: 90,
				nextCycleContribution: 90,
			}),
		]);
	});

	test("does not create pooled quantity operations for a customer-level pooled item", () => {
		const customerProduct = createPooledPrepaidCustomerProduct({
			interval: EntInterval.Lifetime,
			entityAttached: false,
		});

		expect(
			computePooledQuantityUpdateOps({
				customerProduct,
				updatedOptions: [
					{
						feature_id: "messages",
						internal_feature_id: "internal_messages",
						quantity: 4,
					},
				],
			}),
		).toEqual([]);
	});
});
