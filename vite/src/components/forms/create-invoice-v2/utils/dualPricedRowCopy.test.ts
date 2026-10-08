import { describe, expect, test } from "bun:test";
import { type Feature, type ProductItem, UsageModel } from "@autumn/shared";
import { dualPricedRowCopy } from "./dualPricedRowCopy";

const messages = {
	id: "messages",
	name: "Messages",
	display: { singular: "message", plural: "messages" },
} as Feature;

const prepaid = {
	feature_id: "messages",
	usage_model: UsageModel.Prepaid,
	price: 10,
	billing_units: 100,
} as ProductItem;
const usage = {
	feature_id: "messages",
	usage_model: UsageModel.PayPerUse,
	price: 0.04,
} as ProductItem;

describe("dualPricedRowCopy", () => {
	test("prices the pack, then the overage after the prepaid amount", () => {
		expect(
			dualPricedRowCopy({
				prepaid,
				usage,
				prepaidQuantity: 1000,
				feature: messages,
				currency: "USD",
			}),
		).toEqual({
			prepaid: "$10 for 100 Messages",
			usage: "After 1,000, $0.04 per Message",
		});
	});

	test("prices a single-unit pack per unit and an unset prepaid amount generically", () => {
		expect(
			dualPricedRowCopy({
				prepaid: { ...prepaid, billing_units: 1 },
				usage,
				prepaidQuantity: undefined,
				feature: messages,
				currency: "USD",
			}),
		).toEqual({
			prepaid: "$10 per Message",
			usage: "After prepaid, $0.04 per Message",
		});
	});

	test("leaves tiered prices to the item label", () => {
		expect(
			dualPricedRowCopy({
				prepaid,
				usage: {
					...usage,
					price: null,
					tiers: [
						{ to: 100, amount: 0.05 },
						{ to: "inf", amount: 0.03 },
					],
				} as ProductItem,
				prepaidQuantity: 1000,
				feature: messages,
				currency: "USD",
			}),
		).toEqual({ prepaid: "$10 for 100 Messages", usage: null });
	});
});
