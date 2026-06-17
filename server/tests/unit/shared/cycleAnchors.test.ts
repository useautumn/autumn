import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillingInterval,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type Price,
	PriceType,
} from "@autumn/shared";
import {
	entitlementToResetCycleAnchor,
	productToBillingCycleAnchor,
} from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";
import { products } from "@tests/utils/fixtures/db/products";

const feature = ({
	type = FeatureType.Metered,
}: {
	type?: FeatureType;
} = {}) =>
	({
		id: "messages",
		internal_id: "feature_messages",
		org_id: "org_test",
		created_at: 0,
		env: AppEnv.Sandbox,
		name: "Messages",
		type,
		config: {},
		display: null,
		archived: false,
		event_names: [],
		model_markups: null,
	}) satisfies Feature;

const entitlement = ({
	type = FeatureType.Metered,
	allowanceType = AllowanceType.Fixed,
	interval = EntInterval.Month,
}: {
	type?: FeatureType;
	allowanceType?: AllowanceType;
	interval?: EntInterval | null;
} = {}) =>
	({
		id: "ent_messages",
		created_at: 0,
		internal_feature_id: "feature_messages",
		internal_product_id: "product_messages",
		internal_reward_id: null,
		is_custom: false,
		allowance_type: allowanceType,
		allowance: allowanceType === AllowanceType.Unlimited ? null : 100,
		interval,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		org_id: "org_test",
		feature_id: "messages",
		usage_limit: null,
		expiry_duration: null,
		expiry_length: null,
		rollover: null,
		feature: feature({ type }),
	}) satisfies EntitlementWithFeature;

const fixedPrice = ({
	interval,
}: {
	interval: BillingInterval;
}) =>
	({
		id: "price_base",
		internal_product_id: "product_messages",
		org_id: "org_test",
		created_at: 0,
		billing_type: null,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		config: {
			type: PriceType.Fixed,
			amount: 1000,
			interval,
			interval_count: 1,
			stripe_product_id: null,
			feature_id: null,
			internal_feature_id: null,
			stripe_price_id: null,
		},
	}) satisfies Price;

describe("cycle anchor resolvers", () => {
	test.concurrent("stores billing anchor for paid recurring products", () => {
		const now = 1000;
		const anchor = productToBillingCycleAnchor({
			product: products.createFull({
				id: "paid",
				prices: [fixedPrice({ interval: BillingInterval.Month })],
			}),
			billingCycleAnchor: "now",
			now,
		});

		expect(anchor).toBe(now);
	});

	test.concurrent("does not store billing anchor for free products", () => {
		const anchor = productToBillingCycleAnchor({
			product: products.createFull({
				id: "free",
				prices: [],
			}),
			billingCycleAnchor: 1000,
			now: 500,
		});

		expect(anchor).toBeNull();
	});

	test.concurrent("stores reset anchor for resettable entitlements", () => {
		const anchor = entitlementToResetCycleAnchor({
			entitlement: entitlement(),
			resetCycleAnchor: "now",
			now: 1000,
		});

		expect(anchor).toBe(1000);
	});

	test.concurrent("does not store reset anchor for non-resetting entitlements", () => {
		const anchors = [
			entitlementToResetCycleAnchor({
				entitlement: entitlement({ type: FeatureType.Boolean }),
				resetCycleAnchor: 1000,
				now: 500,
			}),
			entitlementToResetCycleAnchor({
				entitlement: entitlement({ allowanceType: AllowanceType.Unlimited }),
				resetCycleAnchor: 1000,
				now: 500,
			}),
			entitlementToResetCycleAnchor({
				entitlement: entitlement({ interval: EntInterval.Lifetime }),
				resetCycleAnchor: 1000,
				now: 500,
			}),
		];

		expect(anchors).toEqual([null, null, null]);
	});
});
