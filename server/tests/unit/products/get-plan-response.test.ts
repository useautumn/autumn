import { describe, expect, test } from "bun:test";
import { AppEnv, type FullProduct } from "@autumn/shared";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const baseProduct = {
	id: "legacy-plan",
	name: "Legacy Plan",
	description: null,
	group: "",
	version: 1,
	env: AppEnv.Sandbox,
	internal_id: "prod_internal",
	org_id: "org_123",
	created_at: 1,
	processor: null,
	base_variant_id: null,
	archived: false,
	config: { ignore_past_due: false },
	metadata: {},
	prices: [],
	entitlements: [],
	free_trial: null,
	free_trials: [],
	free_trial_ids: [],
} satisfies Omit<FullProduct, "is_add_on" | "is_default">;

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
});
