import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import { alignTierCurrencyShapes } from "@/views/products/plan/utils/currencyUtils";
import {
	addTier,
	itemToVolumePricingMode,
	tiersToVolumePricingMode,
	volumePricingModeFitsTiers,
} from "@/views/products/plan/utils/tierUtils";

const commitVolumeTiers = (item: ProductItem): ProductItem =>
	itemToVolumePricingMode({
		item,
		mode: tiersToVolumePricingMode({ tiers: item.tiers }),
	});

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

const mixedTiers: PriceTier[] = [
	{ to: 100, amount: 1, flat_amount: 5 },
	{ to: Infinite, amount: 0.5, flat_amount: 20 },
];

describe("tiersToVolumePricingMode", () => {
	test("mixed per-unit and flat tiers open in the combined mode", () => {
		expect(tiersToVolumePricingMode({ tiers: mixedTiers })).toBe(
			"per_unit_and_flat",
		);
	});

	test("a flat fee on one tier with per-unit rates is still combined", () => {
		expect(
			tiersToVolumePricingMode({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: Infinite, amount: 0.5, flat_amount: 20 },
				],
			}),
		).toBe("per_unit_and_flat");
	});

	test("flat-only tiers open in flat mode", () => {
		expect(
			tiersToVolumePricingMode({
				tiers: [
					{ to: 100, amount: 0, flat_amount: 5 },
					{ to: Infinite, amount: 0, flat_amount: 20 },
				],
			}),
		).toBe("flat");
	});

	test("per-unit tiers open in per-unit mode", () => {
		expect(
			tiersToVolumePricingMode({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: Infinite, amount: 0.5, flat_amount: 0 },
				],
			}),
		).toBe("per_unit");
	});
});

describe("committing volume tiers", () => {
	test("saving mixed tiers keeps every per-unit and flat amount", () => {
		const result = commitVolumeTiers(volumeItem(mixedTiers));
		expect(result.tiers).toEqual(mixedTiers.map((tier) => ({ ...tier })));
	});

	test("saving flat-only tiers keeps the flat fees", () => {
		const tiers: PriceTier[] = [
			{ to: 100, amount: 0, flat_amount: 5 },
			{ to: Infinite, amount: 0, flat_amount: 20 },
		];
		const result = commitVolumeTiers(volumeItem(tiers));
		expect(result.tiers?.map((tier) => tier.flat_amount)).toEqual([5, 20]);
	});
});

describe("itemToVolumePricingMode", () => {
	test("switching per-unit tiers to Unit + Flat keeps the rates and adds fees", () => {
		const result = itemToVolumePricingMode({
			item: volumeItem([
				{ to: 100, amount: 1 },
				{ to: Infinite, amount: 0.5 },
			]),
			mode: "per_unit_and_flat",
		});
		expect(result.tiers).toEqual([
			{ to: 100, amount: 1, flat_amount: 0, additional_currencies: undefined },
			{
				to: Infinite,
				amount: 0.5,
				flat_amount: 0,
				additional_currencies: undefined,
			},
		]);
	});

	test("switching to flat moves rates into flat fees", () => {
		const result = itemToVolumePricingMode({
			item: volumeItem([{ to: Infinite, amount: 2 }]),
			mode: "flat",
		});
		expect(result.tiers?.[0]).toMatchObject({ amount: 0, flat_amount: 2 });
	});
});

describe("alignTierCurrencyShapes", () => {
	test("mixed tiers keep their additional-currency per-unit amounts", () => {
		const item = volumeItem([
			{
				to: 100,
				amount: 1,
				flat_amount: 5,
				additional_currencies: [
					{ currency: "eur", amount: 0.9, flat_amount: 4 },
				],
			},
			{
				to: Infinite,
				amount: 0,
				flat_amount: 20,
				additional_currencies: [
					{ currency: "eur", amount: 0, flat_amount: 18 },
				],
			},
		]);
		const result = alignTierCurrencyShapes(item);
		expect(result.tiers?.map((tier) => tier.additional_currencies)).toEqual([
			[{ currency: "eur", amount: 0.9, flat_amount: 4 }],
			[{ currency: "eur", amount: 0, flat_amount: 18 }],
		]);
	});

	test("a flat-only base tier keeps another currency's per-unit rate", () => {
		const item = volumeItem([
			{
				to: Infinite,
				amount: 0,
				flat_amount: 5,
				additional_currencies: [
					{ currency: "eur", amount: 0.9, flat_amount: 4 },
				],
			},
		]);
		const result = alignTierCurrencyShapes(item);
		expect(result.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.9, flat_amount: 4 },
		]);
	});
});

describe("volumePricingModeFitsTiers", () => {
	test("a Flat toggle no longer fits once a discard restores unit rates", () => {
		expect(
			volumePricingModeFitsTiers({
				mode: "flat",
				tiers: [{ to: Infinite, amount: 1, flat_amount: 5 }],
			}),
		).toBe(false);
	});

	test("a fresh Unit + Flat pick fits while every amount is still 0", () => {
		expect(
			volumePricingModeFitsTiers({
				mode: "per_unit_and_flat",
				tiers: [
					{ to: 100, amount: 0, flat_amount: 0 },
					{ to: Infinite, amount: 0, flat_amount: 0 },
				],
			}),
		).toBe(true);
	});

	test("Unit + Flat no longer fits after graduated pricing cleared the flat fees", () => {
		expect(
			volumePricingModeFitsTiers({
				mode: "per_unit_and_flat",
				tiers: [{ to: Infinite, amount: 1 }],
			}),
		).toBe(false);
	});
});

describe("addTier", () => {
	test("a tier added in Unit + Flat mode keeps the flat-fee field, so the mode still fits", () => {
		let next: ProductItem | undefined;
		addTier({
			item: volumeItem([
				{ to: 100, amount: 1, flat_amount: 0 },
				{ to: Infinite, amount: 0.5, flat_amount: 0 },
			]),
			setItem: (item) => {
				next = item;
			},
		});

		expect(next?.tiers?.[2]?.flat_amount).toBe(0);
		expect(
			volumePricingModeFitsTiers({
				mode: "per_unit_and_flat",
				tiers: next?.tiers,
			}),
		).toBe(true);
	});
});

describe("currency flat fees", () => {
	test("a €4 EUR flat fee survives the save when the base flat fee is 0", () => {
		const item = volumeItem([
			{
				to: 100,
				amount: 1,
				flat_amount: 0,
				additional_currencies: [
					{ currency: "eur", amount: 0.9, flat_amount: 4 },
				],
			},
			{
				to: Infinite,
				amount: 0.5,
				flat_amount: 0,
				additional_currencies: [
					{ currency: "eur", amount: 0.45, flat_amount: 0 },
				],
			},
		]);

		expect(tiersToVolumePricingMode({ tiers: item.tiers })).toBe(
			"per_unit_and_flat",
		);
		const saved = itemToVolumePricingMode({
			item,
			mode: tiersToVolumePricingMode({ tiers: item.tiers }),
		});
		expect(saved.tiers?.[0]?.additional_currencies?.[0]?.flat_amount).toBe(4);
	});

	test("Per unit no longer fits once another currency has a flat fee", () => {
		expect(
			volumePricingModeFitsTiers({
				mode: "per_unit",
				tiers: [
					{
						to: Infinite,
						amount: 1,
						additional_currencies: [
							{ currency: "eur", amount: 0.9, flat_amount: 4 },
						],
					},
				],
			}),
		).toBe(false);
	});
});
