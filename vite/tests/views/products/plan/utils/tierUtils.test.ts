import { describe, expect, test } from "bun:test";
import { Infinite, type ProductItem } from "@autumn/shared";
import {
	cleanTiersForMode,
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

describe("cleanTiersForMode", () => {
	test("flat mode zeroes out amount and preserves flat_amount", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1.5, flat_amount: 50 }),
				makeTier({ to: Infinite, amount: 2, flat_amount: 100 }),
			],
		});

		const result = cleanTiersForMode({ item, mode: "flat" });

		expect(result.tiers).toHaveLength(2);
		expect(result.tiers![0].amount).toBe(0);
		expect(result.tiers![0].flat_amount).toBe(50);
		expect(result.tiers![1].amount).toBe(0);
		expect(result.tiers![1].flat_amount).toBe(100);
	});

	test("per_unit mode clears flat_amount and preserves amount", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 1.5, flat_amount: 50 }),
				makeTier({ to: Infinite, amount: 2, flat_amount: 100 }),
			],
		});

		const result = cleanTiersForMode({ item, mode: "per_unit" });

		expect(result.tiers).toHaveLength(2);
		expect(result.tiers![0].amount).toBe(1.5);
		expect(result.tiers![0].flat_amount).toBeUndefined();
		expect(result.tiers![1].amount).toBe(2);
		expect(result.tiers![1].flat_amount).toBeUndefined();
	});

	test("returns item unchanged when tiers is null", () => {
		const item = makeItem({ tiers: null });
		const result = cleanTiersForMode({ item, mode: "flat" });
		expect(result.tiers).toBeNull();
	});

	test("flat mode handles tiers where flat_amount is null/undefined", () => {
		const item = makeItem({
			tiers: [
				makeTier({ to: 100, amount: 3 }),
				makeTier({ to: Infinite, amount: 0 }),
			],
		});

		const result = cleanTiersForMode({ item, mode: "flat" });

		expect(result.tiers![0].amount).toBe(0);
		expect(result.tiers![0].flat_amount).toBeNull();
		expect(result.tiers![1].amount).toBe(0);
	});

	test("per_unit mode handles tiers that already have no flat_amount", () => {
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 5 })],
		});

		const result = cleanTiersForMode({ item, mode: "per_unit" });

		expect(result.tiers![0].amount).toBe(5);
		expect(result.tiers![0].flat_amount).toBeUndefined();
	});

	test("does not mutate the original item", () => {
		const item = makeItem({
			tiers: [makeTier({ to: 100, amount: 5, flat_amount: 50 })],
		});

		cleanTiersForMode({ item, mode: "flat" });

		expect(item.tiers![0].amount).toBe(5);
		expect(item.tiers![0].flat_amount).toBe(50);
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
