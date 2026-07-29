import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type FullProduct,
	hasMissingStripeResourcesForProduct,
	type Price,
	PriceType,
} from "@autumn/shared";

const product = (overrides: Partial<FullProduct> = {}): FullProduct => ({
	id: "plan",
	name: "Plan",
	description: null,
	group: "",
	version: 1,
	env: AppEnv.Sandbox,
	internal_id: "prod_internal",
	org_id: "org_123",
	created_at: 1,
	processor: { id: "prod_stripe", type: "stripe" },
	base_variant_id: null,
	base_internal_product_id: null,
	archived: false,
	is_add_on: false,
	is_default: false,
	config: { ignore_past_due: false },
	metadata: {},
	prices: [],
	entitlements: [],
	free_trial: null,
	free_trials: [],
	free_trial_ids: [],
	...overrides,
});

const fixedPrice = ({
	amount = 10,
	stripeProductId = "prod_price",
	stripePriceId = "price_123",
}: {
	amount?: number;
	stripeProductId?: string | null;
	stripePriceId?: string | null;
} = {}): Price => ({
	id: "price_fixed",
	internal_product_id: "prod_internal",
	org_id: "org_123",
	created_at: 1,
	is_custom: false,
	entitlement_id: null,
	proration_config: null,
	tier_behavior: null,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		stripe_product_id: stripeProductId,
		stripe_price_id: stripePriceId,
		feature_id: null,
		internal_feature_id: null,
	},
});

const prepaidPrice = ({
	stripeProductId = "prod_feature",
	stripePriceId = "price_123",
	stripePrepaidPriceId = "price_prepaid",
}: {
	stripeProductId?: string | null;
	stripePriceId?: string | null;
	stripePrepaidPriceId?: string | null;
} = {}): Price => ({
	id: "price_prepaid",
	internal_product_id: "prod_internal",
	org_id: "org_123",
	created_at: 1,
	is_custom: false,
	entitlement_id: "ent_1",
	proration_config: null,
	tier_behavior: null,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.StartOfPeriod,
		billing_units: 1,
		feature_id: "messages",
		internal_feature_id: "feature_internal",
		usage_tiers: [{ amount: 10, to: -1 }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_product_id: stripeProductId,
		stripe_price_id: stripePriceId,
		stripe_prepaid_price_v2_id: stripePrepaidPriceId,
	},
});

describe("hasMissingStripeResourcesForProduct", () => {
	test("returns false for a paid product with reusable Stripe IDs", () => {
		expect(
			hasMissingStripeResourcesForProduct({
				product: product({
					prices: [fixedPrice({ stripeProductId: null })],
				}),
			}),
		).toBe(false);
	});

	test("returns true when a paid product has no processor", () => {
		expect(
			hasMissingStripeResourcesForProduct({
				product: product({ processor: null, prices: [fixedPrice()] }),
			}),
		).toBe(true);
	});

	test("ignores zero fixed prices", () => {
		expect(
			hasMissingStripeResourcesForProduct({
				product: product({
					processor: null,
					prices: [
						fixedPrice({
							amount: 0,
							stripeProductId: null,
							stripePriceId: null,
						}),
					],
				}),
			}),
		).toBe(false);
	});

	test("treats preview IDs as missing", () => {
		expect(
			hasMissingStripeResourcesForProduct({
				product: product({
					processor: { id: "prod_PREVIEW_plan", type: "stripe" },
					prices: [
						fixedPrice({
							stripeProductId: "prod_PREVIEW_price",
							stripePriceId: "price_PREVIEW_price",
						}),
					],
				}),
			}),
		).toBe(true);
	});

	test("requires the v2 prepaid Stripe price for prepaid prices", () => {
		expect(
			hasMissingStripeResourcesForProduct({
				product: product({
					prices: [prepaidPrice({ stripePrepaidPriceId: null })],
				}),
			}),
		).toBe(true);
	});

	test("checks Stripe resources on license products", () => {
		const licenseProduct = product({
			id: "license",
			internal_id: "license_internal",
			processor: null,
			prices: [fixedPrice()],
		});
		const parent = product({
			prices: [],
			licenses: [
				{
					id: "plan_license",
					parent_internal_product_id: "prod_internal",
					is_custom: false,
					license_internal_product_id: "license_internal",
					included: 5,
					prepaid_only: false,
					customized: false,
					metadata: null,
					created_at: 1,
					updated_at: 1,
					product: licenseProduct,
				},
			],
		});

		expect(hasMissingStripeResourcesForProduct({ product: parent })).toBe(true);
	});
});
