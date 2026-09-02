/**
 * A RevenueCat mapping owned by a VARIANT plan is never exposed by catalog GET.
 *
 * `revenuecat_mappings` is keyed by the public plan id and has no version
 * dimension, so a variant — which is its own product with its own plan id —
 * legitimately owns its own row. getCatalogV2 loads every row into a
 * plan-id map but only ever hands the base product's row to getPlanResponse,
 * so the nested buildApiPlanVariant render gets nothing.
 *
 * Red (current):  variants[0].plan.processors is undefined even though the row exists
 * Green (after):  each rendered plan looks its own product.id up in the map
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type FullProduct,
	type RevenueCatPlanMapping,
} from "@autumn/shared";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const productFields = {
	description: null,
	group: "",
	version: 1,
	version_slug: "v1",
	active: true,
	deleted_at: null,
	previous_version_slug: null,
	env: AppEnv.Sandbox,
	org_id: "org_123",
	created_at: 1,
	processor: null,
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
};

const basePlanId = "credits";
const variantPlanId = "credits-eu";

const variantProduct = {
	...productFields,
	id: variantPlanId,
	name: "Credits (EU)",
	internal_id: "prod_variant_internal",
	base_variant_id: basePlanId,
	base_internal_product_id: "prod_base_internal",
} as unknown as FullProduct;

const baseProduct = {
	...productFields,
	id: basePlanId,
	name: "Credits",
	internal_id: "prod_base_internal",
	base_variant_id: null,
	base_internal_product_id: null,
	variants: [variantProduct],
} as unknown as FullProduct;

/** One Autumn plan holds N RevenueCat ids — quantity is the axis. */
const variantMapping: RevenueCatPlanMapping = {
	revenuecat_product_ids: ["rc_credits_eu_100", "rc_credits_eu_500"],
	feature_quantities: {
		rc_credits_eu_100: [{ feature_id: "credits", quantity: 100 }],
		rc_credits_eu_500: [{ feature_id: "credits", quantity: 500 }],
	},
};

const baseMapping: RevenueCatPlanMapping = {
	revenuecat_product_ids: ["rc_credits_100"],
	feature_quantities: {
		rc_credits_100: [{ feature_id: "credits", quantity: 100 }],
	},
};

describe("getPlanResponse revenuecat mappings across variants", () => {
	test("renders the variant's own mapping onto the nested variant plan", async () => {
		const response = await getPlanResponse({
			product: baseProduct,
			features: [],
			revenuecatMappings: new Map([
				[basePlanId, baseMapping],
				[variantPlanId, variantMapping],
			]),
			expandVariants: true,
			resolveBaseFullProduct: false,
		});

		expect(response.processors?.revenuecat).toEqual({
			products: [
				{
					product_id: "rc_credits_100",
					feature_quantities: [{ feature_id: "credits", quantity: 100 }],
				},
			],
		});

		const variant = response.variants?.[0];
		expect(variant?.variant_plan_id).toBe(variantPlanId);
		expect(variant?.plan?.processors?.revenuecat).toEqual({
			products: [
				{
					product_id: "rc_credits_eu_100",
					feature_quantities: [{ feature_id: "credits", quantity: 100 }],
				},
				{
					product_id: "rc_credits_eu_500",
					feature_quantities: [{ feature_id: "credits", quantity: 500 }],
				},
			],
		});
	});

	test("a variant-only mapping does not leak onto the base plan", async () => {
		const response = await getPlanResponse({
			product: baseProduct,
			features: [],
			revenuecatMappings: new Map([[variantPlanId, variantMapping]]),
			expandVariants: true,
			resolveBaseFullProduct: false,
		});

		expect(response.processors).toBeUndefined();
		expect(
			response.variants?.[0]?.plan?.processors?.revenuecat?.products,
		).toHaveLength(2);
	});

	test("the single-mapping argument still renders the base plan", async () => {
		const response = await getPlanResponse({
			product: baseProduct,
			features: [],
			revenuecatMapping: baseMapping,
			expandVariants: true,
			resolveBaseFullProduct: false,
		});

		expect(response.processors?.revenuecat?.products?.[0]?.product_id).toBe(
			"rc_credits_100",
		);
		// Guard the optional chain below: the variant plan really was rendered.
		expect(response.variants?.[0]?.plan).toBeDefined();
		expect(response.variants?.[0]?.plan?.processors).toBeUndefined();
	});
});
