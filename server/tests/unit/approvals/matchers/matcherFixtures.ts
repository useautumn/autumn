import {
	AllowanceType,
	CusProductStatus,
	type EntitlementWithFeature,
	type Feature,
	type FullCusProduct,
	type FullProduct,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerFilterMatchesFullCustomer } from "@autumn/shared/api/customers/utils/match/index.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

/**
 * Catalog plans shared by the matcher tests. Each plan is also turned into a
 * FullCusProduct with the same items, so one case table drives both matchers.
 *
 * | plan      | base price | items                                                     |
 * |-----------|------------|-----------------------------------------------------------|
 * | free      | none       | messages (free)                                           |
 * | pro       | fixed      | credits (prepaid, rollover), messages (usage_based)       |
 * | unlimited | none       | seats (free, unlimited), storage (usage_based, allocated) |
 * | empty     | none       | none                                                      |
 */

export const matcherFeatures = [
	{ id: "credits", internal_id: "internal_credits" },
	{ id: "messages", internal_id: "internal_messages" },
	{ id: "seats", internal_id: "internal_seats" },
	{ id: "storage", internal_id: "internal_storage" },
] as Feature[];

const rollover: RolloverConfig = {
	max: 100,
	duration: RolloverExpiryDurationType.Month,
	length: 1,
};

const buildEntitlement = ({
	featureId,
	unlimited = false,
	withRollover = false,
}: {
	featureId: string;
	unlimited?: boolean;
	withRollover?: boolean;
}): EntitlementWithFeature =>
	({
		...entitlements.create({
			id: `ent_${featureId}`,
			featureId,
			featureName: featureId,
			allowance: 100,
			rollover: withRollover ? rollover : null,
		}),
		allowance_type: unlimited ? AllowanceType.Unlimited : AllowanceType.Fixed,
	}) as EntitlementWithFeature;

const freePlan = products.createFull({
	id: "free",
	entitlements: [buildEntitlement({ featureId: "messages" })],
});

const proPlan = products.createFull({
	id: "pro",
	prices: [
		prices.createFixed({ id: "price_pro_base" }),
		prices.createPrepaid({ id: "price_pro_credits", featureId: "credits" }),
		prices.createConsumable({
			id: "price_pro_messages",
			featureId: "messages",
		}),
	],
	entitlements: [
		buildEntitlement({ featureId: "credits", withRollover: true }),
		buildEntitlement({ featureId: "messages" }),
	],
});

const unlimitedPlan = products.createFull({
	id: "unlimited",
	prices: [
		prices.createAllocated({
			id: "price_unlimited_storage",
			featureId: "storage",
		}),
	],
	entitlements: [
		buildEntitlement({ featureId: "seats", unlimited: true }),
		buildEntitlement({ featureId: "storage" }),
	],
});

const emptyPlan = products.createFull({ id: "empty" });

export const plans = {
	free: freePlan,
	pro: proPlan,
	unlimited: unlimitedPlan,
	empty: emptyPlan,
};

export type PlanName = keyof typeof plans;

export const PLAN_NAMES = Object.keys(plans) as PlanName[];

/** The customer's instance of a catalog plan: same prices and entitlements. */
export const planToCustomerProduct = ({
	product,
	status,
}: {
	product: FullProduct;
	status?: FullCusProduct["status"];
}): FullCusProduct => {
	const id = `cus_prod_${product.id}`;
	return customerProducts.create({
		id,
		productId: product.id,
		product,
		status,
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: id }),
		),
		customerEntitlements: product.entitlements.map((entitlement) => ({
			...customerEntitlements.create({
				entitlementId: entitlement.id,
				featureId: entitlement.feature.id,
				featureName: entitlement.feature.name,
				allowance: 100,
				balance: 100,
				customerProductId: id,
			}),
			entitlement,
		})),
	});
};

/** Customers for the customer-filter tests; the downgraded customer's pro plan is expired. */
export const customers = {
	paying: {
		id: "paying",
		customer_products: [planToCustomerProduct({ product: plans.pro })],
	},
	downgraded: {
		id: "downgraded",
		customer_products: [
			planToCustomerProduct({ product: plans.free }),
			planToCustomerProduct({
				product: plans.pro,
				status: CusProductStatus.Expired,
			}),
		],
	},
	unlimited: {
		id: "unlimited",
		customer_products: [planToCustomerProduct({ product: plans.unlimited })],
	},
	noPlan: { id: "noPlan", customer_products: [] },
};

export type CustomerName = keyof typeof customers;
export const CUSTOMER_NAMES = Object.keys(customers) as CustomerName[];

export const matchingCustomers = ({ filter }: { filter: CustomerFilter }) =>
	CUSTOMER_NAMES.filter((customerName) =>
		customerFilterMatchesFullCustomer({
			filter,
			fullCustomer: customers[customerName],
		}),
	);
