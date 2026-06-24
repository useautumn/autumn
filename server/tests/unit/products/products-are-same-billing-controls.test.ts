/**
 * Regression: productsAreSame must detect a billing-controls difference when
 * called with V1 (FullProduct) inputs.
 *
 * The "identical configuration" guard in handleCustomPlanErrors compares two
 * V1 products. The new-side billing controls previously had no V1 column
 * fallback (only the current side did), so a billing-control-only change was
 * reported as billingControlsSame: true and rejected as "identical".
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type FullProduct, productsAreSame } from "@autumn/shared";

const baseProduct = {
	id: "plan",
	name: "Plan",
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
	is_add_on: false,
	is_default: false,
	config: { ignore_past_due: false },
	prices: [],
	entitlements: [],
	free_trial: null,
	free_trials: [],
	free_trial_ids: [],
} satisfies FullProduct;

describe("productsAreSame billing controls (V1)", () => {
	test("detects a new billing control added on the new V1 product", () => {
		const current = { ...baseProduct } as FullProduct;
		const next = {
			...baseProduct,
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 20 },
			],
		} as FullProduct;

		const { itemsSame, billingControlsSame } = productsAreSame({
			curProductV1: current,
			newProductV1: next,
			features: [],
		});

		expect(itemsSame).toBe(true);
		expect(billingControlsSame).toBe(false);
	});

	test("identical billing controls report same", () => {
		const controls = {
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 20 },
			],
		};
		const current = { ...baseProduct, ...controls } as FullProduct;
		const next = { ...baseProduct, ...controls } as FullProduct;

		const { billingControlsSame } = productsAreSame({
			curProductV1: current,
			newProductV1: next,
			features: [],
		});

		expect(billingControlsSame).toBe(true);
	});
});
