import { describe, expect, test } from "bun:test";
import { Infinite, type ProductItem } from "@autumn/shared";
import { applyTierToDisplayValue } from "@/views/products/plan/utils/tierUtils";

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
