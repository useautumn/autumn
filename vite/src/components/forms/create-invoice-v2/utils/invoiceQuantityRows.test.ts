import { describe, expect, test } from "bun:test";
import { type ProductItem, UsageModel } from "@autumn/shared";
import { invoiceQuantityRows } from "./invoiceQuantityRows";

const prepaidMessages = {
	feature_id: "messages",
	usage_model: UsageModel.Prepaid,
	price: 10,
	billing_units: 100,
} as ProductItem;
const usageMessages = {
	feature_id: "messages",
	usage_model: UsageModel.PayPerUse,
	price: 0.04,
} as ProductItem;
const prepaidSeats = {
	feature_id: "seats",
	usage_model: UsageModel.Prepaid,
	price: 5,
} as ProductItem;
const usageCredits = {
	feature_id: "credits",
	usage_model: UsageModel.PayPerUse,
	price: 0.2,
} as ProductItem;

describe("invoiceQuantityRows", () => {
	test("pairs a feature priced both ways, prepaid first", () => {
		expect(
			invoiceQuantityRows({ items: [usageMessages, prepaidMessages] }),
		).toEqual([
			{
				featureId: "messages",
				prepaid: prepaidMessages,
				usage: usageMessages,
			},
		]);
	});

	test("keeps a single row for prepaid-only or usage-only features, in plan order", () => {
		expect(
			invoiceQuantityRows({
				items: [
					prepaidSeats,
					{ price: 100, interval: "month" } as ProductItem,
					usageCredits,
					{ feature_id: "workspaces", included_usage: 3 } as ProductItem,
				],
			}),
		).toEqual([
			{ featureId: "seats", prepaid: prepaidSeats },
			{ featureId: "credits", usage: usageCredits },
		]);
	});
});
