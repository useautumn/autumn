/**
 * priceToStripeNickname
 *
 * Contract:
 *   fixed → Base price
 *   prepaid → Prepaid price (feature)
 *   in-arrear / prorated → Usage-based price (feature)
 *   customize source → " (custom)"
 *   placeholder → " [Placeholder]"
 *   missing feature name → no parentheses
 */

import { describe, expect, test } from "bun:test";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { PriceType } from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { BillWhen } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { priceToStripeNickname } from "./priceToStripeNickname";

const fixed = (): Price =>
	({
		id: "pr_fixed",
		config: {
			type: PriceType.Fixed,
			amount: 20,
			interval: BillingInterval.Month,
		},
	}) as Price;

const usage = ({ billWhen }: { billWhen: BillWhen }): Price =>
	({
		id: "pr_usage",
		config: {
			type: PriceType.Usage,
			bill_when: billWhen,
			interval: BillingInterval.Month,
			usage_tiers: [{ to: -1, amount: 1 }],
		},
	}) as Price;

describe("priceToStripeNickname", () => {
	test("fixed catalog → Base price", () => {
		expect(priceToStripeNickname({ price: fixed() })).toBe("Base price");
	});

	test("fixed customize → Base price (custom)", () => {
		expect(
			priceToStripeNickname({ price: fixed(), source: "customize" }),
		).toBe("Base price (custom)");
	});

	test("prepaid catalog → Prepaid price (Messages)", () => {
		expect(
			priceToStripeNickname({
				price: usage({ billWhen: BillWhen.StartOfPeriod }),
				featureName: "Messages",
			}),
		).toBe("Prepaid price (Messages)");
	});

	test("prepaid customize → Prepaid price (Messages) (custom)", () => {
		expect(
			priceToStripeNickname({
				price: usage({ billWhen: BillWhen.StartOfPeriod }),
				featureName: "Messages",
				source: "customize",
			}),
		).toBe("Prepaid price (Messages) (custom)");
	});

	test("in-arrear → Usage-based price (Words)", () => {
		expect(
			priceToStripeNickname({
				price: usage({ billWhen: BillWhen.EndOfPeriod }),
				featureName: "Words",
			}),
		).toBe("Usage-based price (Words)");
	});

	test("prorated placeholder customize", () => {
		expect(
			priceToStripeNickname({
				price: usage({ billWhen: BillWhen.EndOfPeriod }),
				featureName: "Users",
				isPlaceholder: true,
				source: "customize",
			}),
		).toBe("Usage-based price (Users) [Placeholder] (custom)");
	});

	test("prepaid without feature name omits parentheses", () => {
		expect(
			priceToStripeNickname({
				price: usage({ billWhen: BillWhen.StartOfPeriod }),
			}),
		).toBe("Prepaid price");
	});
});
