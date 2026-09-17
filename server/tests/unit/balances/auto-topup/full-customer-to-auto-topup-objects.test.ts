/**
 * Auto-topup price selection across plans.
 *
 * A customer-level config has no source plan, so it ranks the candidates:
 * the subscription plan the customer is on outranks a standalone top-up
 * product, and recency only breaks ties within a rank. Without the ranking a
 * top-up bought after the plan silently becomes the price source.
 *
 * Note `is_add_on` alone cannot drive this: a standalone top-up product is
 * commonly NOT flagged as an add-on, so the rank keys off whether the product
 * carries a recurring price, with the add-on flag as the secondary key.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FullCustomer,
	PriceType,
	TierBehavior,
} from "@autumn/shared";
import { fullCustomerToAutoTopupObjects } from "@/internal/balances/autoTopUp/helpers/fullCustomerToAutoTopupObjects.js";

const FEATURE = "messages";

const oneOffPrepaidPrice = ({
	priceId,
	entitlementId,
	customerProductId,
	amount,
	tierBehavior,
}: {
	priceId: string;
	entitlementId: string;
	customerProductId: string;
	amount: number;
	tierBehavior?: TierBehavior;
}) => ({
	id: priceId,
	customer_product_id: customerProductId,
	price: {
		id: priceId,
		entitlement_id: entitlementId,
		tier_behavior: tierBehavior,
		config: {
			type: PriceType.Usage,
			interval: BillingInterval.OneOff,
			bill_when: BillWhen.InAdvance,
			usage_tiers: [{ from: 0, to: -1, amount }],
			billing_units: 1,
		},
	},
});

/** The monthly base price that marks a product as a subscription plan. */
const recurringPrice = ({
	priceId,
	customerProductId,
}: {
	priceId: string;
	customerProductId: string;
}) => ({
	id: `${priceId}_base`,
	customer_product_id: customerProductId,
	price: {
		id: `${priceId}_base`,
		entitlement_id: null,
		config: {
			type: PriceType.Fixed,
			interval: BillingInterval.Month,
			amount: 20,
		},
	},
});

/** A customer_product attached at `createdAt` with a one-off prepaid price. */
const planWithOneOff = ({
	id,
	createdAt,
	amount,
	tierBehavior,
	recurring = false,
	isAddOn = false,
}: {
	id: string;
	createdAt: number;
	amount: number;
	tierBehavior?: TierBehavior;
	/** Carries a monthly base price, i.e. a subscription plan. */
	recurring?: boolean;
	isAddOn?: boolean;
}) => {
	const entitlementId = `ent_${id}`;
	const cusEntId = `cusent_${id}`;
	return {
		id,
		internal_product_id: `prod_${id}`,
		status: "active",
		created_at: createdAt,
		starts_at: createdAt,
		product: { id, is_add_on: isAddOn },
		customer_prices: [
			oneOffPrepaidPrice({
				priceId: `price_${id}`,
				entitlementId,
				customerProductId: id,
				amount,
				tierBehavior,
			}),
			...(recurring
				? [recurringPrice({ priceId: `price_${id}`, customerProductId: id })]
				: []),
		],
		customer_entitlements: [
			{
				id: cusEntId,
				customer_product_id: id,
				balance: 0,
				entitlement: {
					id: entitlementId,
					feature_id: FEATURE,
					feature: { id: FEATURE },
					allowance: 0,
				},
			},
		],
	};
};

const buildFullCustomer = ({
	plans,
	threshold = 20,
	quantity = 100,
}: {
	plans: Array<{
		id: string;
		createdAt: number;
		amount: number;
		tierBehavior?: TierBehavior;
		recurring?: boolean;
		isAddOn?: boolean;
	}>;
	threshold?: number;
	quantity?: number;
}) =>
	({
		auto_topups: [{ feature_id: FEATURE, enabled: true, threshold, quantity }],
		customer_products: plans.map(planWithOneOff),
		extra_customer_entitlements: [],
	}) as unknown as FullCustomer;

const NOW = Date.UTC(2026, 5, 25, 12, 0, 0);

describe("fullCustomerToAutoTopupObjects — most-recently-attached price wins", () => {
	test("picks the cusEnt from the plan attached last (cheap first, pricey last)", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{ id: "cp_cheap", createdAt: NOW - 5000, amount: 5 },
					{ id: "cp_pricey", createdAt: NOW - 1000, amount: 10 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_pricey");
	});

	test("picks the cusEnt from the plan attached last regardless of array order", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					// Pricey (most recent) listed FIRST in the array.
					{ id: "cp_pricey", createdAt: NOW - 1000, amount: 10 },
					{ id: "cp_cheap", createdAt: NOW - 5000, amount: 5 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_pricey");
	});

	test("picks the cheaper plan when IT was attached last", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{ id: "cp_pricey", createdAt: NOW - 5000, amount: 10 },
					{ id: "cp_cheap", createdAt: NOW - 1000, amount: 5 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_cheap");
	});

	test("single plan still resolves its one-off prepaid cusEnt", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [{ id: "cp_only", createdAt: NOW, amount: 7 }],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_only");
	});
});

describe("fullCustomerToAutoTopupObjects — tiered one-off prices are charge sources", () => {
	test("a volume-tiered one-off prepaid price resolves as the charge source", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{
						id: "cp_volume",
						createdAt: NOW,
						amount: 0.18,
						tierBehavior: TierBehavior.VolumeBased,
					},
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_volume");
	});
});

describe("fullCustomerToAutoTopupObjects — the plan outranks a standalone top-up", () => {
	test("a subscription plan's price wins over a top-up bought later", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{
						id: "cp_plan",
						createdAt: NOW - 5000,
						amount: 0.18,
						recurring: true,
					},
					{ id: "cp_topup", createdAt: NOW - 1000, amount: 0.5 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_plan");
	});

	test("two top-ups bought after the plan still do not outrank it", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{
						id: "cp_plan",
						createdAt: NOW - 9000,
						amount: 0.18,
						recurring: true,
					},
					{ id: "cp_topup_1", createdAt: NOW - 2000, amount: 0.5 },
					{ id: "cp_topup_2", createdAt: NOW - 1000, amount: 0.5 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_plan");
	});

	test("a non-add-on plan outranks a recurring add-on attached later", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{
						id: "cp_plan",
						createdAt: NOW - 5000,
						amount: 0.18,
						recurring: true,
					},
					{
						id: "cp_addon",
						createdAt: NOW - 1000,
						amount: 0.5,
						recurring: true,
						isAddOn: true,
					},
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_plan");
	});

	test("recency still decides between two plans of the same rank", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{ id: "cp_old", createdAt: NOW - 5000, amount: 0.3, recurring: true },
					{
						id: "cp_new",
						createdAt: NOW - 1000,
						amount: 0.18,
						recurring: true,
					},
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe("cp_new");
	});

	test("falls back to the top-up when no plan carries a refill price", () => {
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer: buildFullCustomer({
				plans: [
					{ id: "cp_topup_old", createdAt: NOW - 5000, amount: 0.5 },
					{ id: "cp_topup_new", createdAt: NOW - 1000, amount: 0.5 },
				],
			}),
			featureId: FEATURE,
		});

		expect(result?.customerEntitlement.customer_product_id).toBe(
			"cp_topup_new",
		);
	});
});
