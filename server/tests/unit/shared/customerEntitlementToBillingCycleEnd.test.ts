import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillWhen,
	BillingInterval,
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
	EntInterval,
	FeatureType,
	Infinite,
	PriceType,
	customerEntitlementToBillingCycleEnd,
	type EntitlementWithFeature,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	type FullCusProduct,
	type Price,
	type Product,
} from "@autumn/shared";

const utc = (
	year: number,
	monthIndex: number,
	day: number,
	hour = 0,
	minute = 0,
) => Date.UTC(year, monthIndex, day, hour, minute);

const feature = () =>
	({
		id: "messages",
		internal_id: "feature_messages",
		org_id: "org_test",
		created_at: 0,
		env: AppEnv.Sandbox,
		name: "Messages",
		type: FeatureType.Metered,
		config: {},
		display: null,
		archived: false,
		event_names: [],
		model_markups: null,
	}) satisfies Feature;

const entitlement = ({
	interval = EntInterval.Month,
	intervalCount = 1,
}: {
	interval?: EntInterval | null;
	intervalCount?: number;
} = {}) =>
	({
		id: "ent_messages",
		created_at: 0,
		internal_feature_id: "feature_messages",
		internal_product_id: "product_messages",
		internal_reward_id: null,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval,
		interval_count: intervalCount,
		carry_from_previous: false,
		entity_feature_id: null,
		org_id: "org_test",
		feature_id: "messages",
		usage_limit: null,
		expiry_duration: null,
		expiry_length: null,
		rollover: null,
		feature: feature(),
	}) satisfies EntitlementWithFeature;

const price = ({
	interval = BillingInterval.Year,
	intervalCount = 1,
	entitlementId = "ent_messages",
}: {
	interval?: BillingInterval;
	intervalCount?: number;
	entitlementId?: string | null;
} = {}) =>
	({
		id: "price_messages",
		internal_product_id: "product_messages",
		org_id: "org_test",
		created_at: 0,
		billing_type: null,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: entitlementId,
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.InAdvance,
			billing_units: 1,
			internal_feature_id: "feature_messages",
			feature_id: "messages",
			usage_tiers: [{ to: Infinite, amount: 0 }],
			interval,
			interval_count: intervalCount,
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

const customerPrice = ({ price }: { price: Price }) =>
	({
		id: "cus_price_messages",
		internal_customer_id: "cus_internal",
		customer_product_id: "cus_product_messages",
		created_at: 0,
		price_id: price.id,
		price,
	}) satisfies FullCustomerPrice;

const product = () =>
	({
		id: "plan_messages",
		name: "Messages",
		description: null,
		is_add_on: false,
		is_default: false,
		version: 1,
		group: "",
		env: AppEnv.Sandbox,
		internal_id: "product_messages",
		org_id: "org_test",
		created_at: 0,
		processor: null,
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
	}) satisfies Product;

const customerProduct = ({
	customerPrices,
	billingCycleAnchor,
	startsAt = utc(2026, 0, 1),
	trialEndsAt = null,
}: {
	customerPrices: FullCustomerPrice[];
	billingCycleAnchor?: number | null;
	startsAt?: number;
	trialEndsAt?: number | null;
}) =>
	({
		id: "cus_product_messages",
		internal_product_id: "product_messages",
		product_id: "plan_messages",
		internal_customer_id: "cus_internal",
		customer_id: "cus_external",
		internal_entity_id: null,
		entity_id: null,
		created_at: startsAt,
		updated_at: null,
		status: CusProductStatus.Active,
		canceled: false,
		starts_at: startsAt,
		access_starts_at: null,
		trial_ends_at: trialEndsAt,
		billing_cycle_anchor: billingCycleAnchor,
		billing_cycle_anchor_resets_at: null,
		canceled_at: null,
		ended_at: null,
		options: [],
		free_trial_id: null,
		collection_method: CollectionMethod.ChargeAutomatically,
		subscription_ids: [],
		scheduled_ids: [],
		processor: null,
		quantity: 1,
		api_semver: null,
		is_custom: false,
		billing_version: BillingVersion.V2,
		external_id: null,
		stripe_checkout_session_id: null,
		previous_customer_product_id: null,
		on_trial_end: null,
		customer_prices: customerPrices,
		customer_entitlements: [],
		product: product(),
		free_trial: null,
	}) satisfies FullCusProduct;

const customerEntitlement = ({
	entitlement,
	price,
	billingCycleAnchor = utc(2026, 0, 15),
	startsAt = utc(2026, 0, 1),
	trialEndsAt = null,
}: {
	entitlement: EntitlementWithFeature;
	price?: Price;
	billingCycleAnchor?: number | null;
	startsAt?: number;
	trialEndsAt?: number | null;
}) => {
	const customerPrices = price ? [customerPrice({ price })] : [];

	return {
		id: "cus_ent_messages",
		internal_customer_id: "cus_internal",
		internal_entity_id: null,
		internal_feature_id: "feature_messages",
		customer_id: "cus_external",
		feature_id: "messages",
		customer_product_id: "cus_product_messages",
		entitlement_id: entitlement.id,
		created_at: startsAt,
		unlimited: false,
		balance: 1000,
		additional_balance: 0,
		usage_allowed: true,
		separate_interval: false,
		reset_cycle_anchor: startsAt,
		next_reset_at: null,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement,
		replaceables: [],
		rollovers: [],
		customer_product: customerProduct({
			customerPrices,
			billingCycleAnchor,
			startsAt,
			trialEndsAt,
		}),
	} satisfies FullCusEntWithFullCusProduct;
};

describe("customerEntitlementToBillingCycleEnd", () => {
	test.concurrent("returns null when reset and billing intervals match", () => {
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Month }),
			}),
			now: utc(2026, 1, 1),
		});

		expect(result).toBeNull();
	});

	test.concurrent("returns null for one-off billing intervals", () => {
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.OneOff }),
			}),
			now: utc(2026, 1, 1),
		});

		expect(result).toBeNull();
	});

	test.concurrent("returns null when no customer product is attached", () => {
		const customerEntitlementWithNoProduct = {
			...customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Year }),
			}),
			customer_product: null,
		} satisfies FullCusEntWithFullCusProduct;

		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlementWithNoProduct,
			now: utc(2026, 1, 1),
		});

		expect(result).toBeNull();
	});

	test.concurrent("uses billing_cycle_anchor to compute the next billing cycle end", () => {
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Year }),
				billingCycleAnchor: utc(2026, 0, 15, 10, 30),
			}),
			now: utc(2026, 2, 1),
		});

		expect(result).toBe(utc(2027, 0, 15, 10, 30));
	});

	test.concurrent("falls back to starts_at for older customer products without a stored anchor", () => {
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Quarter }),
				billingCycleAnchor: null,
				startsAt: utc(2026, 0, 10, 9),
			}),
			now: utc(2026, 1, 1),
		});

		expect(result).toBe(utc(2026, 3, 10, 9));
	});

	test.concurrent("honors billing interval counts", () => {
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({
					interval: BillingInterval.Month,
					intervalCount: 6,
				}),
				billingCycleAnchor: utc(2026, 0, 1),
			}),
			now: utc(2026, 1, 1),
		});

		expect(result).toBe(utc(2026, 6, 1));
	});

	test.concurrent("returns the trial end while the customer product is still trialing", () => {
		const trialEndsAt = utc(2026, 0, 20, 12);
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Year }),
				billingCycleAnchor: utc(2026, 0, 1),
				startsAt: utc(2026, 0, 1),
				trialEndsAt,
			}),
			now: utc(2026, 0, 5),
		});

		expect(result).toBe(trialEndsAt);
	});

	test.concurrent("uses the anchored recurring cycle after a trial has ended", () => {
		const trialEndsAt = utc(2026, 0, 20, 12);
		const result = customerEntitlementToBillingCycleEnd({
			customerEntitlement: customerEntitlement({
				entitlement: entitlement({ interval: EntInterval.Month }),
				price: price({ interval: BillingInterval.Year }),
				billingCycleAnchor: trialEndsAt,
				startsAt: utc(2026, 0, 1),
				trialEndsAt,
			}),
			now: utc(2026, 1, 5),
		});

		expect(result).toBe(utc(2027, 0, 20, 12));
	});
});
