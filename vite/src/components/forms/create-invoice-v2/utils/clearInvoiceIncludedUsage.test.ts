import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	getProductItemDisplay,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";
import { clearInvoiceIncludedUsage } from "./clearInvoiceIncludedUsage";

const items = (list: unknown[]) => list as ProductItem[];

const users = {
	id: "users",
	name: "Users",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Continuous },
} as Feature;

const pricedUsers = {
	feature_id: "users",
	usage_model: UsageModel.Prepaid,
	price: 12.5,
	included_usage: 3,
	billing_units: 1,
};

describe("clearInvoiceIncludedUsage", () => {
	test("a priced feature shows its plain per-unit price, not a grant", () => {
		const [cleared] = clearInvoiceIncludedUsage({
			items: items([pricedUsers]),
		});

		expect(cleared.included_usage).toBe(0);
		expect(getProductItemDisplay({ item: cleared, features: [users] })).toEqual(
			{
				primary_text: "$12.5 per Users",
			},
		);
	});

	test("leaves the base price and unpriced grants alone", () => {
		const base = { price: 20, interval: "month" };
		const grant = { feature_id: "messages", included_usage: 100 };

		expect(clearInvoiceIncludedUsage({ items: items([base, grant]) })).toEqual(
			items([base, grant]),
		);
	});
});
