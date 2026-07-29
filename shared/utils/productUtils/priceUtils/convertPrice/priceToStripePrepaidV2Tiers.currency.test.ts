import { describe, expect, test } from "bun:test";
import "@autumn/shared";
import type { Organization } from "../../../../models/orgModels/orgTable.js";
import type { Entitlement } from "../../../../models/productModels/entModels/entModels.js";
import type { Price } from "../../../../models/productModels/priceModels/priceModels.js";
import { priceToStripeCreatePriceParams } from "./priceToStripeCreatePriceParams.js";
import { priceToStripePrepaidV2Tiers } from "./priceToStripePrepaidV2Tiers.js";

const org = { default_currency: "usd" } as unknown as Organization;

const prepaidPrice = ({
	currencies,
}: {
	currencies?: Record<
		string,
		{ usage_tiers?: { to: number; amount: number }[] }
	>;
}): Price =>
	({
		id: "price_1",
		internal_product_id: "prod_internal",
		entitlement_id: "ent_1",
		tier_behavior: null,
		config: {
			type: "usage",
			bill_when: "start_of_period",
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [
				{ to: 1000, amount: 10 },
				{ to: -1, amount: 8 },
			],
			interval: "month",
			base_currency: "usd",
			currencies,
		},
	}) as unknown as Price;

const entitlement = { allowance: 0 } as unknown as Entitlement;

describe("priceToStripePrepaidV2Tiers per-currency", () => {
	test("default: base tiers in usd", () => {
		const tiers = priceToStripePrepaidV2Tiers({
			price: prepaidPrice({}),
			entitlement,
			org,
		});
		expect(tiers[0].unit_amount_decimal).toBe("1000");
		expect(tiers[1].unit_amount_decimal).toBe("800");
	});

	test("currency eur: amounts from currencies.eur, boundaries unchanged", () => {
		const tiers = priceToStripePrepaidV2Tiers({
			price: prepaidPrice({
				currencies: {
					eur: {
						usage_tiers: [
							{ to: 1000, amount: 9 },
							{ to: -1, amount: 7 },
						],
					},
				},
			}),
			entitlement,
			org,
			currency: "eur",
		});
		expect(tiers[0].unit_amount_decimal).toBe("900");
		expect(tiers[0].up_to).toBe(1000);
		expect(tiers[1].unit_amount_decimal).toBe("700");
	});
});

describe("priceToStripeCreatePriceParams per-currency", () => {
	const fullProduct = {
		name: "Pro",
		entitlements: [
			{
				id: "ent_1",
				internal_product_id: "prod_internal",
				internal_feature_id: "feature_internal",
				allowance: 0,
				feature: { id: "messages", name: "Messages" },
			},
		],
	} as never;

	test("currency eur: params carry eur currency and eur tier amounts", () => {
		const params = priceToStripeCreatePriceParams({
			price: prepaidPrice({
				currencies: {
					eur: {
						usage_tiers: [
							{ to: 1000, amount: 9 },
							{ to: -1, amount: 7 },
						],
					},
				},
			}),
			product: fullProduct,
			org,
			currentStripeProduct: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(params.currency).toBe("eur");
		expect(params.tiers?.[0].unit_amount_decimal).toBe("900");
	});

	test("default: usd params unchanged", () => {
		const params = priceToStripeCreatePriceParams({
			price: prepaidPrice({}),
			product: fullProduct,
			org,
			currentStripeProduct: { id: "prod_shared" } as never,
		});

		expect(params.currency).toBe("usd");
		expect(params.tiers?.[0].unit_amount_decimal).toBe("1000");
	});
});
