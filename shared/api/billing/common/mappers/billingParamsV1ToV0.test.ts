import { describe, expect, test } from "bun:test";
import type { FullProduct } from "@models/productModels/productModels";
import type { SharedContext } from "../../../../types/sharedContext";
import { billingParamsV1ToV0 } from "./billingParamsV1ToV0.js";

// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for a pure mapper test
const ctx = {
	org: { default_currency: "usd" },
	features: [],
	env: "sandbox",
} as any as SharedContext;

const fullProduct = {
	entitlements: [],
	internal_id: "prod_internal",
	org_id: "org_1",
	prices: [],
} as unknown as FullProduct;

describe("billingParamsV1ToV0", () => {
	test("renames V1 fields into the V0 dialect", () => {
		const { request, unrepresentable } = billingParamsV1ToV0({
			ctx,
			fullProduct,
			params: {
				customer_id: "cus_1",
				enable_plan_immediately: true,
				feature_quantities: [{ feature_id: "seats", quantity: 5 }],
				plan_id: "scale",
				proration_behavior: "none",
				starts_at: 1750000000000,
			},
		});
		expect(request).toEqual({
			billing_behavior: "none",
			customer_id: "cus_1",
			enable_product_immediately: true,
			options: [{ feature_id: "seats", quantity: 5 }],
			product_id: "scale",
			starts_at: 1750000000000,
		});
		expect(unrepresentable).toEqual([]);
	});

	test("resolves customize price into a base price item", () => {
		const { request } = billingParamsV1ToV0({
			ctx,
			fullProduct,
			params: {
				customer_id: "cus_1",
				customize: { price: { amount: 1000, interval: "month" } },
				plan_id: "scale",
			},
		});
		const items = request.items as Array<Record<string, unknown>>;
		expect(items).toHaveLength(1);
		expect(items[0]?.price).toBe(1000);
		expect(items[0]?.interval).toBe("month");
	});

	test("maps invoice_mode and customize free_trial/licenses/controls", () => {
		const { request } = billingParamsV1ToV0({
			ctx,
			fullProduct,
			params: {
				customer_id: "cus_1",
				customize: {
					billing_controls: { spend_limits: [] },
					free_trial: { duration_length: 7, duration_type: "day" },
					upsert_licenses: [{ license_plan_id: "lp_1", quantity: 2 }],
				},
				invoice_mode: {
					enable_plan_immediately: true,
					enabled: true,
					finalize: false,
					net_terms_days: 30,
				},
				plan_id: "scale",
			},
		});
		expect(request.invoice).toBe(true);
		expect(request.finalize_invoice).toBe(false);
		expect(request.net_terms_days).toBe(30);
		expect(request.enable_product_immediately).toBe(true);
		expect(request.free_trial).toMatchObject({ duration: "day", length: 7 });
		expect(request.upsert_licenses).toEqual([
			{ license_plan_id: "lp_1", quantity: 2 },
		]);
		expect(request.billing_controls).toEqual({ spend_limits: [] });
		expect(request.items).toBeUndefined();
	});

	test("reports unrepresentable keys and skips item resolution for them", () => {
		const { request, unrepresentable } = billingParamsV1ToV0({
			ctx,
			fullProduct,
			params: {
				customer_id: "cus_1",
				customize: {
					remove_licenses: [{ license_plan_id: "lp_1" }],
					update_items: [{ filter: { feature_id: "seats" }, included: 10 }],
				},
				plan_id: "scale",
			},
		});
		expect(unrepresentable).toEqual([
			"customize.update_items",
			"customize.remove_licenses",
		]);
		expect(request.items).toBeUndefined();
	});
});
