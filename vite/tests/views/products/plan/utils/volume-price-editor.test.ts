import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { stripEditorFields } from "@/utils/product/productItemUtils";
import {
	alignTierCurrencyShapes,
	updateTierCurrencyAmount,
} from "@/views/products/plan/utils/currencyUtils";
import {
	removeTier,
	tierRowKey,
	updateTier,
} from "@/views/products/plan/utils/tierUtils";
import { itemToVolumeExampleBill } from "@/views/products/plan/utils/volumeExampleBill";

const eur = (amount: number, flat_amount?: number) => [
	{ currency: "eur", amount, flat_amount },
];
const tiers: PriceTier[] = [
	{ to: 400, amount: 0.1, flat_amount: 5, additional_currencies: eur(0.09, 4) },
	{
		to: 1900,
		amount: 0.08,
		flat_amount: 10,
		additional_currencies: eur(0.07, 9),
	},
	{ to: Infinite, amount: 0.05, additional_currencies: eur(0.045) },
];
const item = {
	feature_id: "messages",
	included_usage: 100,
	usage_model: UsageModel.PayPerUse,
	tier_behavior: TierBehavior.VolumeBased,
	tiers,
} as ProductItem;

const run = (fn: (setItem: (next: ProductItem) => void) => void) => {
	let next = item;
	fn((updated) => {
		next = updated;
	});
	return next;
};

describe("lossless save", () => {
	const usd = (field: "amount" | "flat_amount") =>
		run((setItem) =>
			updateTier({ item, setItem, index: 1, field, value: "3" }),
		);
	const inEur = (field: "amount" | "flat_amount") =>
		updateTierCurrencyAmount({
			item,
			tierIndex: 1,
			code: "eur",
			field,
			value: "3",
		});

	test("saving with no edits keeps every rate and fee", () => {
		expect(alignTierCurrencyShapes(item).tiers).toEqual(tiers);
	});

	test.each([
		["USD rate", usd("amount"), { amount: 3 }],
		["USD fee", usd("flat_amount"), { flat_amount: 3 }],
		["EUR rate", inEur("amount"), { additional_currencies: eur(3, 9) }],
		["EUR fee", inEur("flat_amount"), { additional_currencies: eur(0.07, 3) }],
	] as const)("editing the %s changes only that cell", (_, edited, patch) => {
		const saved = alignTierCurrencyShapes(edited).tiers;
		expect(saved).toEqual([tiers[0], { ...tiers[1], ...patch }, tiers[2]]);
	});

	test("deleting a middle tier keeps the other rows' keys and values", () => {
		const after = run((setItem) => removeTier({ item, setItem, index: 1 }));
		expect(after.tiers?.map(tierRowKey)).toEqual(["tier-0", "tier-2"]);
		expect(after.tiers?.map((tier) => tier.amount)).toEqual([0.1, 0.05]);
		const [saved] = stripEditorFields({ items: [after] }) ?? [];
		expect(saved.tiers?.every((tier) => !("_uid" in tier))).toBe(true);
	});
});

test.each([
	["usage-based bills the overage", UsageModel.PayPerUse, 300, "usd", 25],
	["prepaid bills every unit", UsageModel.Prepaid, 300, "usd", 35],
	["within included bills nothing", UsageModel.PayPerUse, 100, "usd", 0],
	["EUR uses its own cells", UsageModel.PayPerUse, 300, "eur", 22],
] as const)("example bill: %s", (_, model, usage, currency, total) => {
	const bill = itemToVolumeExampleBill({
		item: { ...item, usage_model: model },
		usage,
		currency,
		baseCurrency: "USD",
	});
	expect(bill.total).toBe(total);
});
