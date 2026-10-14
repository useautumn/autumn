import { describe, expect, test } from "bun:test";
import {
	FeatureType,
	type ProductItem,
	ProductItemInterval,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { isInvoiceCreditItem } from "@/internal/features/invoiceCredits/isInvoiceCreditItem.js";

const credits = features.create({
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: { schema: [] },
});

const messages = features.create({
	id: "messages",
	name: "Messages",
	type: FeatureType.Metered,
});

const pricedCredits = ({
	price = 1,
	billingUnits = 1,
	usageModel = UsageModel.PayPerUse,
	pooled = false,
	additionalCurrencies,
}: {
	price?: number;
	billingUnits?: number;
	usageModel?: UsageModel;
	pooled?: boolean;
	additionalCurrencies?: { currency: string; amount: number }[];
} = {}): ProductItem => ({
	feature_id: credits.id,
	included_usage: 100,
	interval: ProductItemInterval.Month,
	usage_model: usageModel,
	price,
	billing_units: billingUnits,
	pooled,
	base_currency: additionalCurrencies ? "usd" : undefined,
	additional_currencies: additionalCurrencies,
});

const tieredCredits = (
	tiers: {
		to: number | typeof TierInfinite;
		amount: number;
		flat_amount?: number;
	}[],
): ProductItem => ({
	feature_id: credits.id,
	included_usage: 100,
	interval: ProductItemInterval.Month,
	usage_model: UsageModel.PayPerUse,
	billing_units: 1,
	tiers,
});

describe("isInvoiceCreditItem", () => {
	test("P1 pay-per-use at one currency unit per credit itemizes", () => {
		expect(
			isInvoiceCreditItem({ item: pricedCredits(), feature: credits }),
		).toBe(true);
	});

	test("P2 billing units scale the price with the credits", () => {
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({ price: 100, billingUnits: 100 }),
				feature: credits,
			}),
		).toBe(true);
	});

	test("P3 a fractional price per credit is an ordinary overage", () => {
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({ price: 0.002 }),
				feature: credits,
			}),
		).toBe(false);
	});

	test("P4 prepaid credits never itemize", () => {
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({ usageModel: UsageModel.Prepaid }),
				feature: credits,
			}),
		).toBe(false);
	});

	test("P5 an included-only item never itemizes", () => {
		const item: ProductItem = {
			feature_id: credits.id,
			included_usage: 100,
			interval: ProductItemInterval.Month,
		};
		expect(isInvoiceCreditItem({ item, feature: credits })).toBe(false);
	});

	test("P6 a pooled item never itemizes", () => {
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({ pooled: true }),
				feature: credits,
			}),
		).toBe(false);
	});

	test("P7 graduated tiers itemize only when every tier is one unit per credit with no flat fee", () => {
		expect(
			isInvoiceCreditItem({
				item: tieredCredits([
					{ to: 1_000, amount: 1 },
					{ to: TierInfinite, amount: 1 },
				]),
				feature: credits,
			}),
		).toBe(true);
		expect(
			isInvoiceCreditItem({
				item: tieredCredits([
					{ to: 1_000, amount: 1 },
					{ to: TierInfinite, amount: 0.5 },
				]),
				feature: credits,
			}),
		).toBe(false);
		expect(
			isInvoiceCreditItem({
				item: tieredCredits([{ to: TierInfinite, amount: 1, flat_amount: 5 }]),
				feature: credits,
			}),
		).toBe(false);
	});

	test("P8 a metered feature never itemizes, whatever its price", () => {
		expect(
			isInvoiceCreditItem({
				item: { ...pricedCredits(), feature_id: messages.id },
				feature: messages,
			}),
		).toBe(false);
	});

	test("P9 every configured currency must keep the 1:1 price", () => {
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({
					additionalCurrencies: [{ currency: "eur", amount: 0.8 }],
				}),
				feature: credits,
			}),
		).toBe(false);
		expect(
			isInvoiceCreditItem({
				item: pricedCredits({
					additionalCurrencies: [{ currency: "eur", amount: 1 }],
				}),
				feature: credits,
			}),
		).toBe(true);
	});
});
