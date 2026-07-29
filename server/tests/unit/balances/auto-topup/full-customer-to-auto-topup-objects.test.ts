/**
 * Auto-topup price selection across plans.
 *
 * When a customer is on multiple plans that each carry a one-off prepaid price
 * for the same feature, the top-up must charge the MOST RECENTLY attached
 * plan's price — not an arbitrary first match.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FullCustomer,
	PriceType,
} from "@autumn/shared";
import { fullCustomerToAutoTopupObjects } from "@/internal/balances/autoTopUp/helpers/fullCustomerToAutoTopupObjects.js";

const FEATURE = "messages";

const oneOffPrepaidPrice = ({
	priceId,
	entitlementId,
	customerProductId,
	amount,
}: {
	priceId: string;
	entitlementId: string;
	customerProductId: string;
	amount: number;
}) => ({
	id: priceId,
	customer_product_id: customerProductId,
	price: {
		id: priceId,
		entitlement_id: entitlementId,
		config: {
			type: PriceType.Usage,
			interval: BillingInterval.OneOff,
			bill_when: BillWhen.InAdvance,
			usage_tiers: [{ from: 0, to: -1, amount }],
			billing_units: 1,
		},
	},
});

/** A customer_product attached at `createdAt` with a one-off prepaid price. */
const planWithOneOff = ({
	id,
	createdAt,
	amount,
}: {
	id: string;
	createdAt: number;
	amount: number;
}) => {
	const entitlementId = `ent_${id}`;
	const cusEntId = `cusent_${id}`;
	return {
		id,
		internal_product_id: `prod_${id}`,
		status: "active",
		created_at: createdAt,
		starts_at: createdAt,
		customer_prices: [
			oneOffPrepaidPrice({
				priceId: `price_${id}`,
				entitlementId,
				customerProductId: id,
				amount,
			}),
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
	plans: Array<{ id: string; createdAt: number; amount: number }>;
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
