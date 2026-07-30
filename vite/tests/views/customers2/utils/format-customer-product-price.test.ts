import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FullCustomerPrice,
	PriceType,
} from "@autumn/shared";
import { formatCustomerProductPrice } from "@/views/customers2/utils/formatCustomerProductPrice";

const customerPrice = (config: FullCustomerPrice["price"]["config"]) =>
	({ price: { config } }) as FullCustomerPrice;

describe("formatCustomerProductPrice", () => {
	test("formats the customized fixed amount and quantity", () => {
		const result = formatCustomerProductPrice({
			currency: "usd",
			customerProduct: {
				quantity: 3,
				customer_prices: [
					customerPrice({
						type: PriceType.Fixed,
						amount: 49,
						interval: BillingInterval.Month,
					}),
				],
			},
		});

		expect(result).toBe("$147 / month");
	});

	test("uses the attached price currency override", () => {
		const result = formatCustomerProductPrice({
			currency: "eur",
			customerProduct: {
				customer_prices: [
					customerPrice({
						type: PriceType.Fixed,
						amount: 49,
						interval: BillingInterval.Month,
						base_currency: "usd",
						currencies: { eur: { amount: 45 } },
					}),
				],
			},
		});

		expect(result).toBe("€45 / month");
	});

	test("describes variable price components without changing the query shape", () => {
		const result = formatCustomerProductPrice({
			currency: "usd",
			customerProduct: {
				customer_prices: [
					customerPrice({
						type: PriceType.Fixed,
						amount: 20,
						interval: BillingInterval.Month,
					}),
					customerPrice({
						type: PriceType.Usage,
						bill_when: BillWhen.InAdvance,
						billing_units: 100,
						internal_feature_id: "feature_internal",
						feature_id: "messages",
						usage_tiers: [{ to: "inf", amount: 5 }],
						interval: BillingInterval.Month,
					}),
					customerPrice({
						type: PriceType.Usage,
						bill_when: BillWhen.EndOfPeriod,
						billing_units: 1,
						internal_feature_id: "other_feature_internal",
						feature_id: "storage",
						usage_tiers: [{ to: "inf", amount: 0.1 }],
						interval: BillingInterval.Month,
					}),
				],
			},
		});

		expect(result).toBe("$20 / month + prepaid + usage");
	});
});
