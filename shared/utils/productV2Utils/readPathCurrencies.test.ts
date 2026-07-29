import "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { toPriceItem } from "./productItemUtils/mapToItem.js";
import { productV2ToApiPlanV1 } from "./productV2ToApiPlanV1.js";

describe("read path: config.currencies -> ProductItem", () => {
	test("toPriceItem hydrates additional_currencies + base_currency from a fixed config", () => {
		const item = toPriceItem({
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			price: {
				id: "pr_1",
				created_at: 1,
				config: {
					type: "fixed",
					amount: 10,
					interval: "month",
					base_currency: "usd",
					currencies: { eur: { amount: 9 } },
				},
			} as any,
		});

		expect(item.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
		expect(item.base_currency).toBe("usd");
	});
});

describe("read path: ProductItem -> API plan", () => {
	test("productV2ToApiPlanV1 emits base price additional_currencies", () => {
		const plan = productV2ToApiPlanV1({
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			product: {
				id: "pro",
				name: "Pro",
				version: 1,
				env: "sandbox",
				config: {},
				items: [
					{
						type: "price",
						price: 10,
						interval: "month",
						base_currency: "usd",
						additional_currencies: [{ currency: "eur", amount: 9 }],
					},
				],
			} as any,
			features: [],
		});

		expect(plan.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});
});
