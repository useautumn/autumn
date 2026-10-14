import { describe, expect, test } from "bun:test";
import { Infinite, type ProductItem } from "@autumn/shared";
import {
	applyTierToDisplayValue,
	updateTier,
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

describe("updateTier — flat_amount field", () => {
	test("sets flat_amount on the correct tier", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1 }),
				makeTier({ to: Infinite, amount: 0 }),
			],
		});

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 0,
			field: "flat_amount",
			value: "25.50",
		});

		expect(captured).not.toBeNull();
		expect(captured!.tiers![0].flat_amount).toBe(25.5);
		expect(captured!.tiers![0].amount).toBe(1);
	});

	test("sets flat_amount to 0 for empty string", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
		});

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 0,
			field: "flat_amount",
			value: "",
		});

		expect(captured!.tiers![0].flat_amount).toBe(0);
	});

	test("sets flat_amount to 0 for non-numeric string", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
		});

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 0,
			field: "flat_amount",
			value: "abc",
		});

		expect(captured!.tiers![0].flat_amount).toBe(0);
	});

	test("does not affect other tiers", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1, flat_amount: 10 }),
				makeTier({ to: Infinite, amount: 2, flat_amount: 20 }),
			],
		});

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 1,
			field: "flat_amount",
			value: "99",
		});

		expect(captured!.tiers![0].flat_amount).toBe(10);
		expect(captured!.tiers![1].flat_amount).toBe(99);
	});

	test("amount field still works as before", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 1, flat_amount: 50 })],
		});

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 0,
			field: "amount",
			value: "7.25",
		});

		expect(captured!.tiers![0].amount).toBe(7.25);
		expect(captured!.tiers![0].flat_amount).toBe(50);
	});

	test("does nothing when tiers is null", () => {
		let captured: ProductItem | null = null;
		const item = makeItem({ tiers: null });

		updateTier({
			item,
			setItem: (i) => {
				captured = i;
			},
			index: 0,
			field: "flat_amount",
			value: "10",
		});

		expect(captured).toBeNull();
	});
});
