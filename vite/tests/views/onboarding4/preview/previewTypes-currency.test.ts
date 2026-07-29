import { describe, expect, test } from "bun:test";
import type { AgentFeature, AgentProduct } from "@autumn/shared";
import { transformToPreviewProducts } from "@/views/onboarding4/preview/previewTypes";

const euroFeature: AgentFeature = {
	id: "euros",
	name: "Euros",
	type: "single_use",
};

const starterPlan: AgentProduct = {
	id: "org_starter",
	name: "Organisation Starter",
	items: [
		{
			feature_id: null,
			price: 10,
			interval: "month",
		},
		{
			feature_id: "euros",
			included_usage: 5,
			price: 1,
			usage_model: "prepaid",
			billing_units: 1,
			interval: "month",
		},
	],
};

describe("transformToPreviewProducts currency", () => {
	test("before fix: EUR org saw USD symbols because currency defaulted to USD", () => {
		const preview = transformToPreviewProducts({
			products: [starterPlan],
			features: [euroFeature],
			currency: "USD",
		});

		expect(preview[0]?.basePrice.formattedAmount).toBe("$10");
		expect(preview[0]?.items[0]?.display.secondaryText).toContain("$1");
	});

	test("after fix: EUR org sees euro symbols when currency is threaded through", () => {
		const preview = transformToPreviewProducts({
			products: [starterPlan],
			features: [euroFeature],
			currency: "EUR",
		});

		expect(preview[0]?.basePrice.formattedAmount).toBe("€10");
		expect(preview[0]?.items[0]?.display.secondaryText).toContain("€1");
	});
});
