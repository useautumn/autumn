import { describe, expect, test } from "bun:test";
import { type Reward, RewardType } from "@autumn/shared";
import { invoiceDiscountRows } from "./invoiceDiscountRows";

const reward = (id: string, name: string, type: RewardType, value: number) =>
	({ id, name, type, discount_config: { discount_value: value } }) as Reward;

const rewardsById = new Map([
	[
		"fixed25",
		reward("fixed25", "Inv 25 Dollars Off", RewardType.FixedDiscount, 25),
	],
	[
		"pct10",
		reward("pct10", "Inv 10 Percent Off", RewardType.PercentageDiscount, 10),
	],
	[
		"pct33",
		reward("pct33", "Inv 33 Percent Off", RewardType.PercentageDiscount, 33),
	],
	[
		"pct33b",
		reward("pct33b", "Another 33 Percent", RewardType.PercentageDiscount, 33),
	],
]);

describe("invoiceDiscountRows", () => {
	test("stacks coupons in order, each on what is left", () => {
		const rows = invoiceDiscountRows({
			discounts: [
				{ _id: "d1", reward_id: "fixed25" },
				{ _id: "d2", reward_id: "pct10" },
			],
			rewardsById,
			subtotal: 210,
			discountTotal: 43.5,
		});

		expect(rows).toEqual([
			{ label: "Inv 25 Dollars Off ($25.00 off)", amount: 25 },
			{ label: "Inv 10 Percent Off (10% off)", amount: 18.5 },
		]);
	});

	test("a single coupon uses the server's total", () => {
		const rows = invoiceDiscountRows({
			discounts: [{ _id: "d1", reward_id: "pct10" }],
			rewardsById,
			subtotal: 210,
			discountTotal: 21,
		});

		expect(rows).toEqual([{ label: "Inv 10 Percent Off", amount: 21 }]);
	});

	test("no discounts yields no rows", () => {
		expect(
			invoiceDiscountRows({
				discounts: [],
				rewardsById,
				subtotal: 210,
				discountTotal: 0,
			}),
		).toEqual([]);
	});
	test("rows sum to the invoice discount when per-row rounding drifts", () => {
		const rows = invoiceDiscountRows({
			discounts: [
				{ _id: "d1", reward_id: "pct33" },
				{ _id: "d2", reward_id: "pct33b" },
			],
			rewardsById,
			subtotal: 99.99,
			discountTotal: 55.1,
		});

		const shown = rows.reduce((sum, row) => sum + row.amount, 0);
		expect(Math.round(shown * 100) / 100).toBe(55.1);
	});
});
