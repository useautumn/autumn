import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import { alignTierCurrencyShapes } from "@/views/products/plan/utils/currencyUtils";
import {
	itemToCommittedVolumeItem,
	itemToVolumePricingMode,
	itemToVolumePricingModeOnOpen,
} from "@/views/products/plan/utils/tierUtils";

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

/** Opens the item the way the editor does, then commits it with no edits. */
const openAndSave = (item: ProductItem): ProductItem =>
	alignTierCurrencyShapes(
		itemToCommittedVolumeItem({
			item,
			mode: itemToVolumePricingModeOnOpen({ item }),
		}),
	);

// The seeded qa-volume-usage shape: per-unit rates plus flat fees, in USD and EUR.
const mixedTiers: PriceTier[] = [
	{
		to: 400,
		amount: 0.1,
		flat_amount: 5,
		additional_currencies: [{ currency: "eur", amount: 0.09, flat_amount: 4 }],
	},
	{
		to: 1900,
		amount: 0.08,
		flat_amount: 10,
		additional_currencies: [{ currency: "eur", amount: 0.07, flat_amount: 9 }],
	},
	{
		to: Infinite,
		amount: 0.05,
		additional_currencies: [{ currency: "eur", amount: 0.045 }],
	},
];

describe("opening a volume item", () => {
	test("mixed per-unit and flat tiers open in Per Unit", () => {
		expect(
			itemToVolumePricingModeOnOpen({ item: volumeItem(mixedTiers) }),
		).toBe("per_unit");
	});

	test("flat-only tiers still open in Flat", () => {
		expect(
			itemToVolumePricingModeOnOpen({
				item: volumeItem([
					{ to: 100, amount: 0, flat_amount: 5 },
					{ to: Infinite, amount: 0, flat_amount: 20 },
				]),
			}),
		).toBe("flat");
	});
});

describe("saving with no edits", () => {
	test("keeps every per-unit rate and flat fee, base and EUR", () => {
		const saved = openAndSave(volumeItem(mixedTiers));
		expect(saved.tiers).toEqual(
			mixedTiers.map((tier) => ({
				...tier,
				additional_currencies: tier.additional_currencies?.map((entry) => ({
					...entry,
					...(tier.flat_amount != null && {
						flat_amount: entry.flat_amount ?? 0,
					}),
				})),
			})),
		);
	});

	test("keeps a €4 EUR flat fee on a $0 base flat fee", () => {
		const saved = openAndSave(
			volumeItem([
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
			]),
		);
		expect(saved.tiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.9, flat_amount: 4 },
		]);
	});

	test("flat-only tiers keep their flat fees", () => {
		const saved = openAndSave(
			volumeItem([
				{ to: 100, amount: 0, flat_amount: 5 },
				{ to: Infinite, amount: 0, flat_amount: 20 },
			]),
		);
		expect(saved.tiers?.map((tier) => tier.flat_amount)).toEqual([5, 20]);
	});
});

describe("switching modes explicitly", () => {
	test("switching to Flat moves rates into flat fees", () => {
		const result = itemToVolumePricingMode({
			item: volumeItem([{ to: Infinite, amount: 2 }]),
			mode: "flat",
		});
		expect(result.tiers?.[0]).toMatchObject({ amount: 0, flat_amount: 2 });
	});

	test("switching Flat back to Per Unit moves fees into rates", () => {
		const result = itemToVolumePricingMode({
			item: volumeItem([{ to: Infinite, amount: 0, flat_amount: 3 }]),
			mode: "per_unit",
		});
		expect(result.tiers?.[0]).toMatchObject({ amount: 3 });
		expect(result.tiers?.[0]?.flat_amount).toBeUndefined();
	});
});
