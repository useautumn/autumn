import { describe, expect, test } from "bun:test";
import { Infinite, type ProductItem } from "@autumn/shared";
import {
	applyTierToDisplayValue,
	updateTierPrice,
} from "@/views/products/plan/utils/tierUtils";

const makeTier = ({
	to = 100,
	amount = 5,
	flat_amount = null,
}: {
	to?: number | typeof Infinite;
	amount?: number;
	flat_amount?: number | null;
}) => ({ to, amount, flat_amount });

const makeItem = ({
	tiers,
}: {
	tiers: ReturnType<typeof makeTier>[] | null;
}): ProductItem =>
	({
		feature_id: "feat_test",
		tiers,
	}) as ProductItem;

describe("applyTierToDisplayValue", () => {
	test("writes the display to as an internal to without included usage", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1 }),
				makeTier({ to: Infinite, amount: 0 }),
			],
		});
		item.included_usage = 50;

		const result = applyTierToDisplayValue({
			item,
			index: 0,
			displayValue: "250",
		});

		expect(result.tiers![0].to).toBe(200);
		expect(item.tiers![0].to).toBe(100);
	});

	test("commits a pending to so save does not need a blur", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1 }),
				makeTier({ to: Infinite, amount: 0 }),
			],
		});

		const result = applyTierToDisplayValue({
			item,
			index: 0,
			displayValue: "175",
		});

		expect(result.tiers![0].to).toBe(175);
	});

	test("does not update the last infinite tier", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1 }),
				makeTier({ to: Infinite, amount: 0 }),
			],
		});

		const result = applyTierToDisplayValue({
			item,
			index: 1,
			displayValue: "300",
		});

		expect(result).toBe(item);
		expect(result.tiers![1].to).toBe(Infinite);
	});

	test("ignores incomplete display values so typing does not snap back", () => {
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 1 })],
		});

		const result = applyTierToDisplayValue({
			item,
			index: 0,
			displayValue: "",
		});

		expect(result).toBe(item);
	});
});

const setPrice = ({
	item,
	index = 0,
	field,
	value,
}: {
	item: ProductItem;
	index?: number;
	field: "amount" | "flat_amount";
	value: string;
}) =>
	updateTierPrice({
		item,
		index,
		currency: "usd",
		baseCurrency: "USD",
		field,
		value,
	});

describe("updateTierPrice — base currency", () => {
	test("sets flat_amount on the correct tier", () => {
		const result = setPrice({
			item: makeItem({
				tiers: [
					makeTier({ to: 100, amount: 1 }),
					makeTier({ to: Infinite, amount: 0 }),
				],
			}),
			field: "flat_amount",
			value: "25.50",
		});

		expect(result.tiers?.[0].flat_amount).toBe(25.5);
		expect(result.tiers?.[0].amount).toBe(1);
	});

	test("a cleared flat fee is unset, so the tier bills per unit only", () => {
		const result = setPrice({
			item: makeItem({
				tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
			}),
			field: "flat_amount",
			value: "",
		});

		expect(result.tiers?.[0].flat_amount).toBeUndefined();
	});

	test("a non-numeric flat fee is unset", () => {
		const result = setPrice({
			item: makeItem({
				tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
			}),
			field: "flat_amount",
			value: "abc",
		});

		expect(result.tiers?.[0].flat_amount).toBeUndefined();
	});

	test("does not affect other tiers", () => {
		const result = setPrice({
			item: makeItem({
				tiers: [
					makeTier({ to: 100, amount: 1, flat_amount: 10 }),
					makeTier({ to: Infinite, amount: 2, flat_amount: 20 }),
				],
			}),
			index: 1,
			field: "flat_amount",
			value: "99",
		});

		expect(result.tiers?.[0].flat_amount).toBe(10);
		expect(result.tiers?.[1].flat_amount).toBe(99);
	});

	test("amount field keeps the flat fee", () => {
		const result = setPrice({
			item: makeItem({
				tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
			}),
			field: "amount",
			value: "7.25",
		});

		expect(result.tiers?.[0].amount).toBe(7.25);
		expect(result.tiers?.[0].flat_amount).toBe(50);
	});

	test("returns the item unchanged when tiers is null", () => {
		const item = makeItem({ tiers: null });
		expect(setPrice({ item, field: "flat_amount", value: "10" })).toBe(item);
	});
});
