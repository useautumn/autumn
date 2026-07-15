import { describe, expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { generateItemChanges } from "./generateItemChanges.js";

const basePriceItem = (
	additionalCurrencies?: { currency: string; amount: number }[],
): ProductItem =>
	({
		price: 100,
		interval: "month",
		...(additionalCurrencies
			? { additional_currencies: additionalCurrencies }
			: {}),
	}) as ProductItem;

describe("generateItemChanges base price currencies", () => {
	test("currency-only amount change is detected", () => {
		const changes = generateItemChanges({
			originalItems: [basePriceItem([{ currency: "inr", amount: 200 }])],
			updatedItems: [basePriceItem([{ currency: "inr", amount: 400 }])],
		});

		expect(changes).toHaveLength(1);
		expect(changes[0].id).toBe("base-price-modified-0");
	});

	test("adding a currency is detected", () => {
		const changes = generateItemChanges({
			originalItems: [basePriceItem()],
			updatedItems: [basePriceItem([{ currency: "inr", amount: 200 }])],
		});

		expect(changes).toHaveLength(1);
		expect(changes[0].id).toBe("base-price-modified-0");
	});

	test("identical currencies produce no changes", () => {
		const changes = generateItemChanges({
			originalItems: [basePriceItem([{ currency: "inr", amount: 200 }])],
			updatedItems: [basePriceItem([{ currency: "inr", amount: 200 }])],
		});

		expect(changes).toHaveLength(0);
	});
});
