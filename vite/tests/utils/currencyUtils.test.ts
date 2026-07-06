import { describe, expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import {
	addCurrencyToTiers,
	itemCurrencyCodes,
	normalizeItemCurrencies,
	removeCurrencyFromTiers,
	stampBaseCurrency,
	updateTierCurrencyAmount,
} from "@/views/products/plan/utils/currencyUtils";

const tieredItem = (): ProductItem =>
	({
		feature_id: "words",
		tiers: [
			{ to: 100, amount: 0.5 },
			{ to: "inf", amount: 0.3 },
		],
	}) as unknown as ProductItem;

describe("stampBaseCurrency", () => {
	test("stamps lowercase org currency when currencies exist", () => {
		const item = stampBaseCurrency({
			item: {
				price: 10,
				additional_currencies: [{ currency: "eur", amount: 9 }],
			} as unknown as ProductItem,
			orgCurrency: "USD",
		});
		expect(item.base_currency).toBe("usd");
	});

	test("unstamps when no currencies remain", () => {
		const item = stampBaseCurrency({
			item: {
				price: 10,
				base_currency: "usd",
				additional_currencies: [],
			} as unknown as ProductItem,
			orgCurrency: "USD",
		});
		expect(item.base_currency).toBeUndefined();
	});
});

describe("tier currency helpers", () => {
	test("add/remove currency across all tiers", () => {
		let item = addCurrencyToTiers({ item: tieredItem(), code: "eur" });
		expect(item.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0 },
		]);
		expect(item.tiers?.[1].additional_currencies).toEqual([
			{ currency: "eur", amount: 0 },
		]);
		expect(itemCurrencyCodes(item)).toEqual(["eur"]);

		item = removeCurrencyFromTiers({ item, code: "eur" });
		expect(item.tiers?.[0].additional_currencies).toEqual([]);
		expect(itemCurrencyCodes(item)).toEqual([]);
	});

	test("updates a single tier's currency amount", () => {
		let item = addCurrencyToTiers({ item: tieredItem(), code: "eur" });
		item = updateTierCurrencyAmount({
			item,
			tierIndex: 1,
			code: "eur",
			field: "amount",
			value: "0.25",
		});
		expect(item.tiers?.[0].additional_currencies?.[0].amount).toBe(0);
		expect(item.tiers?.[1].additional_currencies?.[0].amount).toBe(0.25);
	});

	test("rounds tier currency amounts to the currency's precision", () => {
		let item = addCurrencyToTiers({ item: tieredItem(), code: "eur" });
		item = updateTierCurrencyAmount({
			item,
			tierIndex: 0,
			code: "eur",
			field: "amount",
			value: "0.25678",
		});
		expect(item.tiers?.[0].additional_currencies?.[0].amount).toBe(0.26);
	});

	test("clamps negative tier currency amounts to zero", () => {
		let item = addCurrencyToTiers({ item: tieredItem(), code: "eur" });
		item = updateTierCurrencyAmount({
			item,
			tierIndex: 0,
			code: "eur",
			field: "amount",
			value: "-5",
		});
		expect(item.tiers?.[0].additional_currencies?.[0].amount).toBe(0);
	});
});

describe("normalizeItemCurrencies", () => {
	test("drops incomplete codes and base-currency collisions, lowercases, stamps", () => {
		const item = normalizeItemCurrencies({
			item: {
				price: 10,
				additional_currencies: [
					{ currency: "EU", amount: 1 },
					{ currency: "EUR", amount: 9 },
					{ currency: "usd", amount: 10 },
				],
			} as unknown as ProductItem,
			orgCurrency: "USD",
		});
		expect(item.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
		expect(item.base_currency).toBe("usd");
	});

	test("unstamps when every entry is dropped", () => {
		const item = normalizeItemCurrencies({
			item: {
				price: 10,
				base_currency: "usd",
				additional_currencies: [{ currency: "e", amount: 1 }],
			} as unknown as ProductItem,
			orgCurrency: "usd",
		});
		expect(item.additional_currencies).toBeUndefined();
		expect(item.base_currency).toBeUndefined();
	});

	test("normalizes per-tier entries", () => {
		let item = addCurrencyToTiers({ item: tieredItem(), code: "eur" });
		item = normalizeItemCurrencies({ item, orgCurrency: "usd" });
		expect(item.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0 },
		]);
		expect(item.base_currency).toBe("usd");
	});
});
