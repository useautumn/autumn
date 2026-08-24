import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	type FreeTrial,
	FreeTrialDuration,
	type FullProduct,
	type Price,
	PriceType,
} from "@autumn/shared";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const baseProduct = {
	id: "legacy-plan",
	name: "Legacy Plan",
	description: null,
	group: "",
	version: 1,
	version_slug: "v1",
	active: true,
deleted_at: null,
previous_version_slug: null,
	env: AppEnv.Sandbox,
	internal_id: "prod_internal",
	org_id: "org_123",
	created_at: 1,
	processor: null,
	base_variant_id: null,
	base_internal_product_id: null,
	archived: false,
	config: { ignore_past_due: false },
	metadata: {},
	prices: [],
	entitlements: [],
	free_trial: null,
	free_trials: [],
	free_trial_ids: [],
} satisfies Omit<FullProduct, "is_add_on" | "is_default">;

const cardRequiredTrial = {
	id: "ft_123",
	duration: FreeTrialDuration.Day,
	length: 7,
	unique_fingerprint: false,
	created_at: 1,
	internal_product_id: "prod_internal",
	is_custom: false,
	card_required: true,
} satisfies FreeTrial;

const monthlyPrice = {
	id: "price_123",
	internal_product_id: "prod_internal",
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount: 20,
		interval: BillingInterval.Month,
		feature_id: null,
		internal_feature_id: null,
	},
} satisfies Price;

describe("getPlanResponse", () => {
	test("normalizes null product booleans to DB defaults", async () => {
		const response = await getPlanResponse({
			product: {
				...baseProduct,
				is_add_on: null,
				is_default: null,
			} as unknown as FullProduct,
			features: [],
		});

		expect(response.add_on).toBe(false);
		expect(response.auto_enable).toBe(false);
	});

	test("forces card_required off for a trial on a free plan", async () => {
		const response = await getPlanResponse({
			product: {
				...baseProduct,
				is_add_on: false,
				is_default: false,
				free_trial: cardRequiredTrial,
			} as unknown as FullProduct,
			features: [],
		});

		expect(response.free_trial?.card_required).toBe(false);
	});

	test("keeps card_required on for a trial on a paid plan", async () => {
		const response = await getPlanResponse({
			product: {
				...baseProduct,
				is_add_on: false,
				is_default: false,
				prices: [monthlyPrice],
				free_trial: cardRequiredTrial,
			} as unknown as FullProduct,
			features: [],
		});

		expect(response.free_trial?.card_required).toBe(true);
	});
});
