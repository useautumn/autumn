import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillWhen,
	BillingInterval,
	EntInterval,
	type Entitlement,
	type FeatureOptions,
	getStartingBalance,
	Infinite,
	type Price,
	PriceType,
} from "@autumn/shared";

const makeEntitlement = ({
	allowance,
}: {
	allowance: number;
}) =>
	({
		id: "ent_credits",
		created_at: 0,
		internal_feature_id: "feature_credits",
		internal_product_id: "product_credits",
		internal_reward_id: null,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		org_id: "org_test",
		feature_id: "credits",
		usage_limit: null,
		expiry_duration: null,
		expiry_length: null,
		rollover: null,
	}) satisfies Entitlement;

const makeFeatureOptions = ({
	quantity,
}: {
	quantity: number;
}) =>
	({
		feature_id: "credits",
		quantity,
		upcoming_quantity: null,
		adjustable_quantity: null,
		internal_feature_id: "feature_credits",
	}) satisfies FeatureOptions;

const makeUsagePrice = ({
	billWhen,
	billingUnits,
}: {
	billWhen: BillWhen;
	billingUnits: number;
}) =>
	({
		id: "price_credits",
		internal_product_id: "product_credits",
		org_id: "org_test",
		created_at: 0,
		billing_type: null,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: "ent_credits",
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: billWhen,
			billing_units: billingUnits,
			internal_feature_id: "feature_credits",
			feature_id: "credits",
			usage_tiers: [{ to: Infinite, amount: 0 }],
			interval: BillingInterval.Year,
			interval_count: 1,
			stripe_meter_id: null,
			stripe_price_id: null,
			stripe_empty_price_id: null,
			stripe_product_id: null,
			stripe_placeholder_price_id: null,
			stripe_event_name: null,
			stripe_prepaid_price_v2_id: null,
			should_prorate: false,
		},
	}) satisfies Price;

describe("getStartingBalance", () => {
	test.concurrent(
		"adds allowance to option quantity times billing units for prepaid prices",
		() => {
			const balance = getStartingBalance({
				entitlement: makeEntitlement({ allowance: 100 }),
				options: makeFeatureOptions({ quantity: 3 }),
				relatedPrice: makeUsagePrice({
					billWhen: BillWhen.InAdvance,
					billingUnits: 25,
				}),
				productQuantity: 7,
			});

			expect(balance).toBe(175);
		},
	);

	test.concurrent("avoids precision errors when multiplying billing units", () => {
		const balance = getStartingBalance({
			entitlement: makeEntitlement({ allowance: 0.1 }),
			options: makeFeatureOptions({ quantity: 0.2 }),
			relatedPrice: makeUsagePrice({
				billWhen: BillWhen.InAdvance,
				billingUnits: 0.3,
			}),
		});

		expect(balance).toBe(0.16);
	});

	test.concurrent("multiplies free entitlement allowance by product quantity", () => {
		const balance = getStartingBalance({
			entitlement: makeEntitlement({ allowance: 10 }),
			productQuantity: 4,
		});

		expect(balance).toBe(40);
	});

	test.concurrent("returns allowance for usage prices that are not prepaid", () => {
		const balance = getStartingBalance({
			entitlement: makeEntitlement({ allowance: 100 }),
			options: makeFeatureOptions({ quantity: 3 }),
			relatedPrice: makeUsagePrice({
				billWhen: BillWhen.EndOfPeriod,
				billingUnits: 25,
			}),
		});

		expect(balance).toBe(100);
	});
});
