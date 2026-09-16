import { expect, test } from "bun:test";
import {
	AppEnv,
	FeatureType,
	FeatureUsageType,
	type FullPlanLicense,
	type FullProduct,
	ProductItemInterval,
} from "@autumn/shared";
import { getPlanLicensePreview } from "@/views/onboarding/panels/getPlanLicensePreview";

const seatProduct = {
	id: "seat",
	internal_id: "product_seat",
	name: "Seat",
	env: AppEnv.Sandbox,
	created_at: 0,
	version: 1,
	prices: [
		{
			id: "price_seat",
			config: {
				type: "fixed",
				amount: 20,
				interval: "month",
				currencies: { eur: { amount: 18 } },
			},
		},
	],
	entitlements: [],
} as unknown as FullProduct;

const preview = ({
	product = seatProduct,
	included = 10,
	currency = "USD",
}: {
	product?: FullProduct;
	included?: number;
	currency?: string;
} = {}) =>
	getPlanLicensePreview({
		license: { product, included } as FullPlanLicense,
		currency,
		orgDefaultCurrency: "USD",
	});

test("license preview shows included seats and their per-seat monthly price", () => {
	const result = preview();
	expect(result.display).toEqual({
		primary_text: "10 Seat",
		secondary_text: "then $20 per Seat per month",
	});
	expect(result.items).toEqual([]);
	expect(result.hiddenItemCount).toBe(0);
});

test("license preview respects effective pricing, currency, and zero included seats", () => {
	const result = preview({ included: 0, currency: "EUR" });
	expect(result.display).toEqual({
		primary_text: "€18",
		secondary_text: "per Seat per month",
	});
});

test("free licenses do not invent an additional seat charge", () => {
	const result = preview({ product: { ...seatProduct, prices: [] } });
	expect(result.display.primary_text).toBe("10 Seat");
	expect(result.display.secondary_text).toBeUndefined();
});

test("effective license features are compacted independently of the seat price", () => {
	const entitlements = Array.from({ length: 5 }, (_, index) => ({
		id: `entitlement_${index}`,
		internal_feature_id: `feature_${index}`,
		allowance: 100,
		interval: "month",
		feature: {
			id: `feature_${index}`,
			internal_id: `feature_${index}`,
			name: `Feature ${index}`,
			type: FeatureType.Metered,
			config: { usage_type: FeatureUsageType.Single },
		},
	}));
	const result = preview({
		product: { ...seatProduct, entitlements } as FullProduct,
	});
	expect(result.items).toHaveLength(2);
	expect(result.items[0]).toMatchObject({
		feature_id: "feature_0",
		included_usage: 100,
		interval: ProductItemInterval.Month,
	});
	expect(result.hiddenItemCount).toBe(3);
});
