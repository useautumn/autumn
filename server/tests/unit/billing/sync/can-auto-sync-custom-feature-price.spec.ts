import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillingInterval,
	BillWhen,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
	FullProduct,
	Price,
	PriceType,
	SyncParamsV1,
	TierInfinite,
} from "@autumn/shared";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync";
import type { SubscriptionMatch } from "@/internal/billing/v2/actions/sync/detect/types";

const emailEntitlement = {
	id: "ent_catalog_emails",
	internal_product_id: "prod_internal_enterprise",
	internal_feature_id: "feat_internal_emails",
	feature_id: "emails",
	allowance: 50_000,
	allowance_type: AllowanceType.Fixed,
	interval: EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	feature: {
		id: "emails",
		internal_id: "feat_internal_emails",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
	},
} as EntitlementWithFeature;

const emailPrice = {
	id: "pr_catalog_emails",
	internal_product_id: "prod_internal_enterprise",
	entitlement_id: emailEntitlement.id,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1000,
		internal_feature_id: "feat_internal_emails",
		feature_id: "emails",
		usage_tiers: [{ amount: 0.9, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
	},
} as Price;

const product = {
	id: "transactional_enterprise",
	internal_id: "prod_internal_enterprise",
	is_add_on: false,
	group: "Transactional",
	prices: [emailPrice],
	entitlements: [emailEntitlement],
} as FullProduct;

const match = {
	stripe_subscription_id: "sub_enterprise",
	stripe_schedule_id: null,
	phaseMatches: [
		{
			start_date: 0,
			end_date: null,
			is_current: true,
			item_diffs: [
				{
					stripe: {
						id: "si_enterprise_overage",
						stripe_price_id: "price_enterprise_overage",
					},
					match: {
						kind: "autumn_price",
						matched_on: {
							type: "stripe_product_id",
							stripe_product_id: "prod_enterprise_overage",
						},
						price: emailPrice,
						product,
					},
				},
			],
			plans: [
				{
					product,
					quantity: 1,
					base: { kind: "custom", stripe_item_id: "si_enterprise_base" },
					features: [],
					extras: [],
					warnings: [],
				},
			],
		},
	],
} as SubscriptionMatch;

const params = ({
	stripePriceId = "price_enterprise_overage",
	featureId = "emails",
	removeFeature = true,
	putStyle = false,
	removeInterval,
	duplicateItem = false,
	planId = "transactional_enterprise",
	duplicatePlan = false,
}: {
	stripePriceId?: string;
	featureId?: string;
	removeFeature?: boolean;
	putStyle?: boolean;
	removeInterval?: "month" | "year";
	duplicateItem?: boolean;
	planId?: string;
	duplicatePlan?: boolean;
} = {}): SyncParamsV1 => {
	const item = {
		feature_id: featureId,
		included: 1_500_000,
		reset: { interval: "month" as const },
		price: {
			stripe_price_id: stripePriceId,
			amount: 0.47,
			interval: "month" as const,
			billing_units: 1000,
			billing_method: "usage_based" as const,
		},
	};

	const plan = {
		plan_id: planId,
		customize: putStyle
			? { items: duplicateItem ? [item, item] : [item] }
			: {
					remove_items: removeFeature
						? [
								{
									feature_id: "emails",
									interval: removeInterval,
								},
							]
						: [],
					add_items: duplicateItem ? [item, item] : [item],
				},
	};

	return {
		customer_id: "cus_enterprise",
		stripe_subscription_id: "sub_enterprise",
		phases: [
			{
				starts_at: "now",
				plans: duplicatePlan ? [plan, { ...plan, plan_id: "other" }] : [plan],
			},
		],
	};
};

describe("canAutoSync custom feature prices", () => {
	test("remains blocked without an explicit sync resolution", () => {
		expect(canAutoSync({ match })).toMatchObject({
			eligible: false,
			reason: "custom_feature_price",
		});
	});

	test("allows an exact PATCH-style feature price replacement", () => {
		expect(canAutoSync({ match, params: params() })).toEqual({ eligible: true });
	});

	test("allows an exact PUT-style feature price replacement", () => {
		expect(canAutoSync({ match, params: params({ putStyle: true }) })).toEqual({
			eligible: true,
		});
	});

	test("allows enterprise selection to change the proposed plan id", () => {
		expect(
			canAutoSync({ match, params: params({ planId: "selected_enterprise" }) }),
		).toEqual({ eligible: true });
	});

	test("rejects the wrong Stripe price or feature", () => {
		expect(
			canAutoSync({
				match,
				params: params({ stripePriceId: "price_other" }),
			}),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
		expect(
			canAutoSync({ match, params: params({ featureId: "contacts" }) }),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
	});

	test("rejects PATCH-style additions that leave the catalog item in place", () => {
		expect(
			canAutoSync({ match, params: params({ removeFeature: false }) }),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
	});

	test("rejects ineffective removal filters and duplicate feature items", () => {
		expect(
			canAutoSync({ match, params: params({ removeInterval: "year" }) }),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
		expect(
			canAutoSync({ match, params: params({ duplicateItem: true }) }),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
		expect(
			canAutoSync({
				match,
				params: params({ putStyle: true, duplicateItem: true }),
			}),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
	});

	test("rejects multiple plans claiming the same Stripe feature price", () => {
		expect(
			canAutoSync({ match, params: params({ duplicatePlan: true }) }),
		).toMatchObject({ eligible: false, reason: "custom_feature_price" });
	});
});
