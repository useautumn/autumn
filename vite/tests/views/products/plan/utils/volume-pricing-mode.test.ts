import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import {
	alignTierCurrencyShapes,
	updateTierCurrencyAmount,
} from "@/views/products/plan/utils/currencyUtils";
import {
	itemToVolumePricingModeOnOpen,
	updateTier,
} from "@/views/products/plan/utils/tierUtils";

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

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

/** What the API receives on save: tiers as edited, currency shapes aligned. */
const saveItem = (item: ProductItem) => alignTierCurrencyShapes(item);

/** The tiers a save of `tiers` should send: unchanged, plus a 0 fee where the base has one. */
const expectedSavedTiers = (tiers: PriceTier[]) =>
	tiers.map((tier) => ({
		...tier,
		additional_currencies: tier.additional_currencies?.map((entry) => ({
			...entry,
			...(tier.flat_amount != null && { flat_amount: entry.flat_amount ?? 0 }),
		})),
	}));

/** Types into one tier input the way PriceTiers does for the given mode. */
const typeInto = ({
	item,
	mode,
	index,
	value,
}: {
	item: ProductItem;
	mode: "flat" | "per_unit";
	index: number;
	value: string;
}): ProductItem => {
	let next = item;
	updateTier({
		item,
		setItem: (updated) => {
			next = updated;
		},
		index,
		field: mode === "flat" ? "flat_amount" : "amount",
		value,
	});
	return next;
};

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

describe("saving", () => {
	test("saving with no edits keeps every rate and fee, base and EUR", () => {
		expect(saveItem(volumeItem(mixedTiers)).tiers).toEqual(
			expectedSavedTiers(mixedTiers),
		);
	});

	test("keeps a €4 EUR flat fee on a $0 base flat fee", () => {
		const saved = saveItem(
			volumeItem([
				{
					to: 100,
					amount: 1,
					flat_amount: 0,
					additional_currencies: [
						{ currency: "eur", amount: 0.9, flat_amount: 4 },
					],
				},
				{ to: Infinite, amount: 0.5, flat_amount: 0 },
			]),
		);
		expect(saved.tiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.9, flat_amount: 4 },
		]);
	});
});

describe("typing edits only the mode's field", () => {
	test("typing in Flat only changes flat_amount", () => {
		const edited = typeInto({
			item: volumeItem(mixedTiers),
			mode: "flat",
			index: 0,
			value: "7",
		});
		expect(edited.tiers?.[0]).toMatchObject({ amount: 0.1, flat_amount: 7 });
	});

	test("typing in Per Unit only changes amount", () => {
		const edited = typeInto({
			item: volumeItem(mixedTiers),
			mode: "per_unit",
			index: 1,
			value: "0.06",
		});
		expect(edited.tiers?.[1]).toMatchObject({ amount: 0.06, flat_amount: 10 });
	});
});

describe("currency flat fees typed in Flat mode", () => {
	test("a €4 fee typed on a per-unit tier survives the save", () => {
		const item = volumeItem([
			{
				to: 100,
				amount: 1,
				additional_currencies: [{ currency: "eur", amount: 0.9 }],
			},
			{
				to: Infinite,
				amount: 0.5,
				additional_currencies: [{ currency: "eur", amount: 0.45 }],
			},
		]);
		const edited = updateTierCurrencyAmount({
			item,
			tierIndex: 0,
			code: "eur",
			field: "flat_amount",
			value: "4",
		});
		const saved = saveItem(edited);

		expect(saved.tiers?.[0]).toMatchObject({ amount: 1, flat_amount: 0 });
		expect(saved.tiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.9, flat_amount: 4 },
		]);
	});
});
