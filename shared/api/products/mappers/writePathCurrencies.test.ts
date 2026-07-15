import { describe, expect, test } from "bun:test";
import { itemToPriceAndEnt } from "@utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";
import type { SharedContext } from "../../../types/sharedContext";
import { planV1ToProductItems } from "./planV1ToProductItems.js";

// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for a pure mapper test
const ctx = {
	org: { default_currency: "usd" },
	features: [],
} as any as SharedContext;

describe("multi-currency write path (base/fixed price)", () => {
	test("base price: params -> ProductItem -> config.currencies + base_currency", () => {
		const items = planV1ToProductItems({
			ctx,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			plan: {
				items: [],
				price: {
					amount: 10,
					interval: "month",
					additional_currencies: [{ currency: "eur", amount: 9 }],
				},
			} as any,
		});

		const baseItem = items[0];
		expect(baseItem.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
		expect(baseItem.base_currency).toBe("usd");

		const { newPrice } = itemToPriceAndEnt({
			item: baseItem,
			orgId: "org_1",
			isCustom: false,
			features: [],
		});

		expect(newPrice?.config.currencies).toEqual({ eur: { amount: 9 } });
		expect(newPrice?.config.base_currency).toBe("usd");
	});

	test("no currencies -> no currencies map and no base_currency", () => {
		const items = planV1ToProductItems({
			ctx,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			plan: {
				items: [],
				price: { amount: 10, interval: "month" },
			} as any,
		});

		const { newPrice } = itemToPriceAndEnt({
			item: items[0],
			orgId: "org_1",
			isCustom: false,
			features: [],
		});

		expect(newPrice?.config.currencies).toBeUndefined();
		expect(newPrice?.config.base_currency).toBeUndefined();
	});

	test("rejects a base price additional currency equal to the org default", () => {
		expect(() =>
			planV1ToProductItems({
				ctx,
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				plan: {
					items: [],
					price: {
						amount: 10,
						interval: "month",
						additional_currencies: [{ currency: "USD", amount: 10 }],
					},
				} as any,
			}),
		).toThrow();
	});
});
