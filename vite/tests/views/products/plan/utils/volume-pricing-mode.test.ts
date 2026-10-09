import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import { alignTierCurrencyShapes } from "@/views/products/plan/utils/currencyUtils";
import {
	cleanVolumeTiersForCommit,
	migrateTiersToVolumePricingMode,
	tiersToVolumePricingMode,
} from "@/views/products/plan/utils/tierUtils";

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

describe("cleanVolumeTiersForCommit", () => {
	test("saving mixed tiers keeps every per-unit and flat amount", () => {
		const result = cleanVolumeTiersForCommit({ item: volumeItem(mixedTiers) });
		expect(result.tiers).toEqual(mixedTiers.map((tier) => ({ ...tier })));
	});

	test("saving flat-only tiers keeps the flat fees", () => {
		const tiers: PriceTier[] = [
			{ to: 100, amount: 0, flat_amount: 5 },
			{ to: Infinite, amount: 0, flat_amount: 20 },
		];
		const result = cleanVolumeTiersForCommit({ item: volumeItem(tiers) });
		expect(result.tiers?.map((tier) => tier.flat_amount)).toEqual([5, 20]);
	});
});

describe("migrateTiersToVolumePricingMode", () => {
	test("switching per-unit tiers to Unit + Flat keeps the rates and adds fees", () => {
		const result = migrateTiersToVolumePricingMode({
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
		const result = migrateTiersToVolumePricingMode({
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
});
