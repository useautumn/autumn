import { describe, expect, test } from "bun:test";
import "@autumn/shared";
import type { FeaturePriceItem } from "../../../models/productV2Models/productItemModels/featurePriceItem.js";
import type { PriceItem } from "../../../models/productV2Models/productItemModels/priceItem.js";
import {
	featurePriceItemsAreSame,
	priceItemsAreSame,
} from "./compareItemUtils.js";

const priceItem = (
	currencies?: { currency: string; amount: number }[],
): PriceItem =>
	({
		price: 20,
		interval: "month",
		additional_currencies: currencies,
	}) as unknown as PriceItem;

const featurePriceItem = (
	tierCurrencies?: { currency: string; amount: number }[],
): FeaturePriceItem =>
	({
		feature_id: "words",
		included_usage: 0,
		interval: "month",
		usage_model: "usage_based",
		tiers: [
			{ to: "inf", amount: 0.5, additional_currencies: tierCurrencies },
		],
	}) as unknown as FeaturePriceItem;

describe("comparators detect currency-only edits", () => {
	test("priceItemsAreSame: false when additional_currencies differ", () => {
		expect(
			priceItemsAreSame({
				item1: priceItem([{ currency: "eur", amount: 18 }]),
				item2: priceItem([{ currency: "eur", amount: 17 }]),
			}),
		).toBe(false);
		expect(
			priceItemsAreSame({
				item1: priceItem([{ currency: "eur", amount: 18 }]),
				item2: priceItem(),
			}),
		).toBe(false);
	});

	test("priceItemsAreSame: true when currencies match regardless of order", () => {
		expect(
			priceItemsAreSame({
				item1: priceItem([
					{ currency: "eur", amount: 18 },
					{ currency: "gbp", amount: 16 },
				]),
				item2: priceItem([
					{ currency: "gbp", amount: 16 },
					{ currency: "eur", amount: 18 },
				]),
			}),
		).toBe(true);
	});

	test("featurePriceItemsAreSame: false when a tier currency amount changes", () => {
		const result = featurePriceItemsAreSame({
			item1: featurePriceItem([{ currency: "eur", amount: 0.4 }]),
			item2: featurePriceItem([{ currency: "eur", amount: 4 }]),
		});
		expect(result.same).toBe(false);
	});

	test("featurePriceItemsAreSame: true when tier currencies match", () => {
		const result = featurePriceItemsAreSame({
			item1: featurePriceItem([{ currency: "eur", amount: 0.4 }]),
			item2: featurePriceItem([{ currency: "eur", amount: 0.4 }]),
		});
		expect(result.same).toBe(true);
	});
});
