import { describe, expect, test } from "bun:test";
import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { buildUpdateSubscriptionCustomizationParams } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionRequestBody";
import { selectPaidPlanType } from "@/views/products/plan/utils/selectPaidPlanType";

describe("paid plan type selection", () => {
	test("preserves the existing base price and feature items", () => {
		const items = [
			{ price: 3_000, interval: "year", interval_count: 1 },
			{ feature_id: "AI_CREDITS", included_usage: 10_000 },
		] as ProductItem[];
		const product = {
			id: "pro_yearly",
			name: "Pro Yearly",
			planType: "paid",
			basePriceType: "recurring",
			items,
		} as FrontendProduct;

		const selectedProduct = selectPaidPlanType({ product });
		const request = buildUpdateSubscriptionCustomizationParams({
			items: selectedProduct.items,
			addLicenses: null,
		});

		expect(request.items).toEqual(items);
	});
});
