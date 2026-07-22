import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { getContributionUsageReapply } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages.js";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages.js";

const CURRENT_EPOCH_MS = Date.UTC(2027, 0, 1);

const createCustomerProduct = ({
	id,
	pooled,
	balance,
	entityAttached = pooled,
	usageAllowed = false,
}: {
	id: string;
	pooled: boolean;
	balance: number;
	entityAttached?: boolean;
	usageAllowed?: boolean;
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer_entitlement_${id}`,
		entitlementId: `entitlement_${id}`,
		featureId: "messages",
		internalFeatureId: "internal_messages",
		featureName: "Messages",
		allowance: 500,
		balance,
		customerProductId: id,
		interval: EntInterval.Month,
		usageAllowed,
		nextResetAt: CURRENT_EPOCH_MS + 2_592_000_000,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled,
	};
	customerEntitlement.reset_cycle_anchor = CURRENT_EPOCH_MS;

	return customerProducts.create({
		id,
		productId: `product_${id}`,
		customerEntitlements: [customerEntitlement],
		internalEntityId: entityAttached ? "internal_entity_one" : undefined,
		entityId: entityAttached ? "entity_one" : undefined,
		status: CusProductStatus.Active,
		startsAt: CURRENT_EPOCH_MS,
	});
};

describe("non-pooled to pooled usage carry", () => {
	test("existing-usage carry still excludes pooled sources", () => {
		const source = createCustomerProduct({
			id: "pooled_existing_usage_source",
			pooled: true,
			balance: 400,
		});

		expect(
			cusProductToExistingUsages({
				cusProduct: source,
				carryAllConsumableFeatures: true,
			}),
		).toEqual({});
	});

	test("existing-usage carry includes a customer-level pooled item", () => {
		const source = createCustomerProduct({
			id: "customer_level_pooled_existing_usage_source",
			pooled: true,
			entityAttached: false,
			balance: 400,
		});

		expect(
			cusProductToExistingUsages({
				cusProduct: source,
				carryAllConsumableFeatures: true,
			}),
		).toEqual({
			internal_messages: {
				usage: 100,
				entityUsages: {},
			},
		});
	});

	test("existing-usage initialization preserves pooled overage", () => {
		const target = createCustomerProduct({
			id: "existing_usage_target",
			pooled: true,
			balance: 500,
		});

		applyExistingUsages({
			ctx: contexts.create({}),
			customerProduct: target,
			existingUsages: {
				internal_messages: {
					usage: 600,
					entityUsages: {},
				},
			},
			entities: [],
		});

		expect(target.customer_entitlements[0]?.balance).toBe(-100);
	});

	test("existing-usage initialization preserves overage for a customer-level pooled item", () => {
		const target = createCustomerProduct({
			id: "customer_level_pooled_existing_usage_target",
			pooled: true,
			entityAttached: false,
			balance: 500,
		});

		applyExistingUsages({
			ctx: contexts.create({}),
			customerProduct: target,
			existingUsages: {
				internal_messages: {
					usage: 600,
					entityUsages: {},
				},
			},
			entities: [],
		});

		expect(target.customer_entitlements[0]?.balance).toBe(-100);
	});

	test("pooled extraction captures carried usage before normalizing the source", () => {
		const source = createCustomerProduct({
			id: "transition_source",
			pooled: false,
			balance: 400,
		});
		const target = createCustomerProduct({
			id: "transition_target",
			pooled: true,
			balance: 400,
		});
		const fullCustomer = customers.create({
			customerProducts: [source, target],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct: target,
			attachBillingContext: {
				currentCustomerProduct: source,
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: CURRENT_EPOCH_MS,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				usageReapply: {
					amount: 100,
					excludedSourceCustomerProductId: source.id,
				},
			}),
		]);
		expect(prepared.customerProduct.customer_entitlements[0]?.balance).toBe(0);
	});

	test("pooled extraction captures carried overage", () => {
		const source = createCustomerProduct({
			id: "overage_transition_source",
			pooled: false,
			balance: -100,
		});
		const target = createCustomerProduct({
			id: "overage_transition_target",
			pooled: true,
			balance: -100,
		});
		const fullCustomer = customers.create({
			customerProducts: [source, target],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct: target,
			attachBillingContext: {
				currentCustomerProduct: source,
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: CURRENT_EPOCH_MS,
			},
		});

		expect(prepared.pooledBalanceOps[0]).toEqual(
			expect.objectContaining({
				usageReapply: {
					amount: 600,
					excludedSourceCustomerProductId: source.id,
				},
			}),
		);
	});

	test("pooled replacements do not infer usage from a normalized source row", () => {
		const source = createCustomerProduct({
			id: "normalized_pooled_source",
			pooled: true,
			balance: 0,
		});
		const target = createCustomerProduct({
			id: "normalized_pooled_target",
			pooled: true,
			balance: 0,
		});
		const fullCustomer = customers.create({
			customerProducts: [source, target],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct: target,
			attachBillingContext: {
				currentCustomerProduct: source,
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: CURRENT_EPOCH_MS,
			},
		});

		expect(prepared.pooledBalanceOps).toHaveLength(2);
		expect(prepared.pooledBalanceOps[1]).not.toHaveProperty("usageReapply");
	});

	test("an unchanged contribution replay cannot reapply transition usage", () => {
		const usageReapply = {
			amount: 100,
			excludedSourceCustomerProductId: "transition_source",
		};
		const existingContribution = {
			featureId: "messages",
			usageReapply,
			previousContributionExists: true,
			contributionDelta: 0,
		};

		expect(
			getContributionUsageReapply({
				featureId: "messages",
				usageReapply,
				previousContributionExists: false,
				contributionDelta: 500,
			}),
		).toEqual({ featureId: "messages", ...usageReapply });
		expect(getContributionUsageReapply(existingContribution)).toBeUndefined();
	});

	test("reactivating a zeroed contribution reapplies usage from the ordinary phase", () => {
		const usageReapply = {
			amount: 100,
			excludedSourceCustomerProductId: "round_trip_source",
		};
		const dormantContribution = {
			featureId: "messages",
			usageReapply,
			previousContributionExists: true,
			contributionDelta: 500,
		};

		expect(getContributionUsageReapply(dormantContribution)).toEqual({
			featureId: "messages",
			...usageReapply,
		});
	});
});
