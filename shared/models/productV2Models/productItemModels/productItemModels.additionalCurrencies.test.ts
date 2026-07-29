import { describe, expect, test } from "bun:test";
import { ProductItemSchema } from "./productItemModels.js";

describe("ProductItem additional currencies", () => {
	test("preserves top-level additional_currencies + base_currency on a flat price item", () => {
		const parsed = ProductItemSchema.parse({
			feature_id: "seats",
			price: 10,
			base_currency: "usd",
			additional_currencies: [{ currency: "eur", amount: 9 }],
		});

		expect(parsed.base_currency).toBe("usd");
		expect(parsed.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});

	test("preserves per-tier additional_currencies", () => {
		const parsed = ProductItemSchema.parse({
			feature_id: "messages",
			tiers: [
				{
					to: 1000,
					amount: 0.5,
					additional_currencies: [{ currency: "eur", amount: 0.4 }],
				},
				{
					to: "inf",
					amount: 0.3,
					additional_currencies: [{ currency: "eur", amount: 0.25 }],
				},
			],
		});

		expect(parsed.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
	});

	test("parses without currency fields (backward compatible)", () => {
		const parsed = ProductItemSchema.parse({ feature_id: "seats", price: 10 });

		expect(parsed.base_currency).toBeUndefined();
		expect(parsed.additional_currencies).toBeUndefined();
	});
});
