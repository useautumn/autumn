import { describe, expect, test } from "bun:test";
import {
	type AdditionalCurrencyTier,
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

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

const eurTiers = ({ baseFlat }: { baseFlat?: number }): PriceTier[] => [
	{
		to: 400,
		amount: 0.1,
		flat_amount: baseFlat,
		additional_currencies: [{ currency: "eur", amount: 0.09 }],
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
	updateTierPrice({
		item,
		index,
		currency,
		baseCurrency: "USD",
		field,
		value,
	});

const readCell = ({
	item,
	index = 0,
	currency,
}: {
	item: ProductItem;
	index?: number;
	currency: string;
}) =>
	tierPriceInCurrency({
		tier: item.tiers?.[index] as PriceTier,
		code: currency,
		baseCurrency: "USD",
	});

describe("tier table ↔ item round-trip", () => {
	test("a base cell reads back what it wrote", () => {
		const item = editCell({
			item: volumeItem(eurTiers({})),
			currency: "usd",
			field: "flat_amount",
			value: "5",
		});
		expect(readCell({ item, currency: "usd" })).toMatchObject({
			amount: 0.1,
			flat_amount: 5,
		});
		expect(readCell({ item, currency: "eur" })).toMatchObject({
			amount: 0.09,
		});
		expect(readCell({ item, currency: "eur" }).flat_amount).toBeUndefined();
	});

	test("an EUR cell writes that tier's EUR price and leaves USD alone", () => {
		const item = editCell({
			item: volumeItem(eurTiers({})),
			index: 1,
			currency: "eur",
			field: "amount",
			value: "0.04",
		});
		expect(readCell({ item, index: 1, currency: "eur" }).amount).toBe(0.04);
		expect(readCell({ item, index: 1, currency: "usd" }).amount).toBe(0.05);
	});

	test("a currency with no price set on a tier reads blank, not the USD price", () => {
		const item = volumeItem([{ to: Infinite, amount: 1 }]);
		expect(readCell({ item, currency: "gbp" })).toEqual({});
	});

	test("an EUR flat fee on a tier whose USD flat fee is 0 survives the save", () => {
		const item = editCell({
			item: volumeItem(eurTiers({ baseFlat: 0 })),
			currency: "eur",
			field: "flat_amount",
			value: "4",
		});
		expect(item.tiers?.[0].flat_amount).toBe(0);
		expect(
			alignTierCurrencyShapes(item).tiers?.[0].additional_currencies,
		).toEqual([{ currency: "eur", amount: 0.09, flat_amount: 4 }]);
	});

	test("an EUR flat fee on a tier with a blank USD flat fee survives the save", () => {
		const item = editCell({
			item: volumeItem(eurTiers({})),
			currency: "eur",
			field: "flat_amount",
			value: "4",
		});
		expect(item.tiers?.[0].flat_amount).toBe(0);
		expect(
			alignTierCurrencyShapes(item).tiers?.[0].additional_currencies?.[0]
				.flat_amount,
		).toBe(4);
	});

	test("clearing the only flat fee leaves the tier per-unit again", () => {
		const withFee = editCell({
			item: volumeItem(eurTiers({})),
			currency: "eur",
			field: "flat_amount",
			value: "4",
		});
		const cleared = editCell({
			item: withFee,
			currency: "eur",
			field: "flat_amount",
			value: "",
		});
		expect(cleared.tiers?.[0].flat_amount).toBeUndefined();
	});
});

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

describe("lossless save", () => {
	test("saving with no edits keeps every rate and fee, base and EUR", () => {
		expect(alignTierCurrencyShapes(volumeItem(mixedTiers)).tiers).toEqual(
			mixedTiers,
		);
	});

	const setEur = (tier: PriceTier, patch: Partial<AdditionalCurrencyTier>) => ({
		...tier,
		additional_currencies: tier.additional_currencies?.map((entry) => ({
			...entry,
			...patch,
		})),
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

	test("an EUR flat fee on a tier with no USD flat fee survives an unrelated edit and save", () => {
		const item = editCell({
			item: volumeItem([
				{
					to: Infinite,
					amount: 0.1,
					additional_currencies: [
						{ currency: "eur", amount: 0.09, flat_amount: 4 },
					],
				},
			]),
			currency: "usd",
			field: "amount",
			value: "0.2",
		});
		const saved = alignTierCurrencyShapes(item).tiers?.[0];
		expect(saved?.flat_amount).toBe(0);
		expect(saved?.additional_currencies?.[0].flat_amount).toBe(4);
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

describe("addTier", () => {
	test("a new tier starts with a blank flat fee", () => {
		let next: ProductItem | undefined;
		addTier({
			item: volumeItem([
				{ to: 100, amount: 1, flat_amount: 5 },
				{ to: Infinite, amount: 0.5, flat_amount: 20 },
			]),
			setItem: (item) => {
				next = item;
			},
		});
		expect(next?.tiers?.[2]).toMatchObject({ to: Infinite, amount: 0 });
		expect(next?.tiers?.[2].flat_amount).toBeUndefined();
	});
});

describe("tier row keys", () => {
	const threeTiers = volumeItem([
		{ to: 400, amount: 0.1, flat_amount: 5 },
		{ to: 1900, amount: 0.08 },
		{ to: Infinite, amount: 0.05, flat_amount: 20 },
	]);
	const keysOf = (item: ProductItem) =>
		(item.tiers ?? []).map((tier, index) => tierRowKey({ tier, index }));
	const removeMiddle = (item: ProductItem) => {
		let next = item;
		removeTier({
			item,
			index: 1,
			setItem: (updated) => {
				next = updated;
			},
		});
		return next;
	};

	test("deleting a middle tier keeps each remaining row's key and values", () => {
		const before = keysOf(threeTiers);
		const after = removeMiddle(threeTiers);

		expect(keysOf(after)).toEqual([before[0], before[2]]);
		expect(
			after.tiers?.map(({ to, amount, flat_amount }) => ({
				to,
				amount,
				flat_amount,
			})),
		).toEqual([
			{ to: 400, amount: 0.1, flat_amount: 5 },
			{ to: Infinite, amount: 0.05, flat_amount: 20 },
		]);
	});

	test("a tier added after a delete gets a key no row already has", () => {
		let next = removeMiddle(threeTiers);
		addTier({
			item: next,
			setItem: (updated) => {
				next = updated;
			},
		});
		expect(new Set(keysOf(next)).size).toBe(3);
	});

	test("row ids never reach the saved tiers", () => {
		const saved = alignTierCurrencyShapes(removeMiddle(threeTiers));
		expect(saved.tiers?.some((tier) => "_uid" in tier)).toBe(false);
	});
});

describe("itemToTierBehavior", () => {
	test("graduated drops every flat fee", () => {
		const result = itemToTierBehavior({
			item: volumeItem([
				{
					to: Infinite,
					amount: 1,
					flat_amount: 5,
					additional_currencies: [
						{ currency: "eur", amount: 0.9, flat_amount: 4 },
					],
				},
			]),
			tierBehavior: TierBehavior.Graduated,
		});
		expect(result.tier_behavior).toBe(TierBehavior.Graduated);
		expect(result.tiers?.[0]).toEqual({
			to: Infinite,
			amount: 1,
			flat_amount: undefined,
			additional_currencies: [
				{ currency: "eur", amount: 0.9, flat_amount: undefined },
			],
		});
	});

	test("volume keeps the tiers as they are", () => {
		const item = volumeItem(eurTiers({ baseFlat: 5 }));
		const result = itemToTierBehavior({
			item: { ...item, tier_behavior: TierBehavior.Graduated },
			tierBehavior: TierBehavior.VolumeBased,
		});
		expect(result).toEqual(item);
	});
});
