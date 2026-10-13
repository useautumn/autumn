import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import {
	alignTierCurrencyShapes,
	tierPriceInCurrency,
} from "@/views/products/plan/utils/currencyUtils";
import { tierRowKey } from "@/views/products/plan/utils/tierUids";
import {
	addTier,
	itemToTierBehavior,
	removeTier,
	updateTierPrice,
} from "@/views/products/plan/utils/tierUtils";

type CurrencyEntry = NonNullable<PriceTier["additional_currencies"]>[number];

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
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

const editCell = ({
	item,
	index = 0,
	currency,
	field,
	value,
}: {
	item: ProductItem;
	index?: number;
	currency: string;
	field: "amount" | "flat_amount";
	value: string;
}) =>
	updateTierPrice({ item, index, currency, baseCurrency: "USD", field, value });

const run = (fn: (setItem: (item: ProductItem) => void) => void) => {
	let next: ProductItem | undefined;
	fn((item) => {
		next = item;
	});
	return next as ProductItem;
};

const setEur = (tier: PriceTier, patch: Partial<CurrencyEntry>) => ({
	...tier,
	additional_currencies: tier.additional_currencies?.map((entry) => ({
		...entry,
		...patch,
	})),
});

describe("lossless save", () => {
	test("saving with no edits keeps every rate and fee, base and EUR", () => {
		expect(alignTierCurrencyShapes(volumeItem(mixedTiers)).tiers).toEqual(
			mixedTiers,
		);
	});

	test.each([
		{
			currency: "usd",
			field: "amount",
			apply: (t: PriceTier) => ({ ...t, amount: 3 }),
		},
		{
			currency: "usd",
			field: "flat_amount",
			apply: (t: PriceTier) => ({ ...t, flat_amount: 3 }),
		},
		{
			currency: "eur",
			field: "amount",
			apply: (t: PriceTier) => setEur(t, { amount: 3 }),
		},
		{
			currency: "eur",
			field: "flat_amount",
			apply: (t: PriceTier) => setEur(t, { flat_amount: 3 }),
		},
	] as const)(
		"editing $currency $field on tier 2 changes only that value",
		({ currency, field, apply }) => {
			const saved = alignTierCurrencyShapes(
				editCell({
					item: volumeItem(mixedTiers),
					index: 1,
					currency,
					field,
					value: "3",
				}),
			);
			expect(saved.tiers).toEqual(
				mixedTiers.map((tier, i) => (i === 1 ? apply(tier) : tier)),
			);
		},
	);

	test.each([
		{ name: "0", baseFlat: 0 },
		{ name: "blank", baseFlat: undefined },
	])(
		"an EUR flat fee on a tier whose USD flat fee is $name survives the save",
		({ baseFlat }) => {
			const item = volumeItem([
				{
					to: Infinite,
					amount: 0.1,
					flat_amount: baseFlat,
					additional_currencies: [{ currency: "eur", amount: 0.09 }],
				},
			]);
			const saved = alignTierCurrencyShapes(
				editCell({ item, currency: "eur", field: "flat_amount", value: "4" }),
			).tiers?.[0];
			expect(saved?.flat_amount).toBe(0);
			expect(saved?.additional_currencies).toEqual([
				{ currency: "eur", amount: 0.09, flat_amount: 4 },
			]);
		},
	);

	test("an EUR-only flat fee survives an unrelated USD edit", () => {
		const item = volumeItem([
			{
				to: Infinite,
				amount: 0.1,
				additional_currencies: [
					{ currency: "eur", amount: 0.09, flat_amount: 4 },
				],
			},
		]);
		const saved = alignTierCurrencyShapes(
			editCell({ item, currency: "usd", field: "amount", value: "0.2" }),
		).tiers?.[0];
		expect(saved?.additional_currencies?.[0].flat_amount).toBe(4);
	});

	test("clearing the only flat fee leaves the tier per-unit again", () => {
		const item = volumeItem([{ to: Infinite, amount: 0.1, flat_amount: 5 }]);
		const cleared = editCell({
			item,
			currency: "usd",
			field: "flat_amount",
			value: "",
		});
		expect(cleared.tiers?.[0].flat_amount).toBeUndefined();
	});

	test("a currency with no price set on a tier reads blank, not the USD price", () => {
		expect(
			tierPriceInCurrency({
				tier: { to: Infinite, amount: 1 },
				code: "gbp",
				baseCurrency: "USD",
			}),
		).toEqual({});
	});
});

describe("tier row keys", () => {
	const keysOf = (item: ProductItem) =>
		(item.tiers ?? []).map((tier, index) => tierRowKey({ tier, index }));
	const removeMiddle = (item: ProductItem) =>
		run((setItem) => removeTier({ item, setItem, index: 1 }));

	test("deleting a middle tier keeps each remaining row's key and values", () => {
		const item = volumeItem(mixedTiers);
		const after = removeMiddle(item);
		expect(keysOf(after)).toEqual([keysOf(item)[0], keysOf(item)[2]]);
		expect(after.tiers?.map(({ to, amount }) => ({ to, amount }))).toEqual([
			{ to: 400, amount: 0.1 },
			{ to: Infinite, amount: 0.05 },
		]);
	});

	test("a tier added after a delete gets a fresh key and a blank flat fee", () => {
		const next = run((setItem) =>
			addTier({ item: removeMiddle(volumeItem(mixedTiers)), setItem }),
		);
		expect(new Set(keysOf(next)).size).toBe(3);
		expect(next.tiers?.[2].flat_amount).toBeUndefined();
	});

	test("row ids never reach the saved tiers", () => {
		const saved = alignTierCurrencyShapes(removeMiddle(volumeItem(mixedTiers)));
		expect(saved.tiers?.some((tier) => "_uid" in tier)).toBe(false);
	});
});

describe("itemToTierBehavior", () => {
	test("graduated drops every flat fee", () => {
		const result = itemToTierBehavior({
			item: volumeItem(mixedTiers),
			tierBehavior: TierBehavior.Graduated,
		});
		expect(result.tiers?.[0]).toMatchObject({
			amount: 0.1,
			flat_amount: undefined,
		});
		expect(
			result.tiers?.[0].additional_currencies?.[0].flat_amount,
		).toBeUndefined();
	});

	test("volume keeps the tiers as they are", () => {
		const item = volumeItem(mixedTiers);
		expect(
			itemToTierBehavior({
				item: { ...item, tier_behavior: TierBehavior.Graduated },
				tierBehavior: TierBehavior.VolumeBased,
			}),
		).toEqual(item);
	});
});
