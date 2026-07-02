import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type EntitlementWithFeature,
	type Organization,
	type Price,
	PriceType,
	type Product,
} from "@autumn/shared";

mock.module("@server/internal/products/prices/PriceService", () => ({
	PriceService: { update: async () => undefined },
}));

import { createStripeArrearProrated } from "@/external/stripe/createStripePrice/createStripeArrearProrated";

const allocatedPrice = ({
	currencies,
}: {
	currencies?: Record<
		string,
		{ usage_tiers?: { to: number; amount: number }[] }
	>;
}): Price =>
	({
		id: "price_allocated",
		internal_product_id: "prod_internal",
		org_id: "org_1",
		created_at: 1,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: "ent_1",
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: true,
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "seats",
			usage_tiers: [{ to: -1, amount: 10 }],
			interval: BillingInterval.Month,
			interval_count: 1,
			base_currency: "usd",
			currencies,
			stripe_price_id: null,
			stripe_product_id: null,
		},
	}) as unknown as Price;

const entitlement = {
	id: "ent_1",
	internal_product_id: "prod_internal",
	internal_feature_id: "feature_internal",
	allowance: 0,
	feature: { id: "seats", name: "Seats" },
} as unknown as EntitlementWithFeature;

const org = { default_currency: "usd" } as unknown as Organization;
const product = {
	name: "Pro",
	processor: { id: "prod_shared" },
} as unknown as Product;

const makeStripeCli = () => {
	const priceCreates: Record<string, unknown>[] = [];
	const cli = {
		prices: {
			create: async (params: Record<string, unknown>) => {
				priceCreates.push(params);
				return {
					id: `price_${priceCreates.length}_${params.currency}`,
					product: "prod_shared",
				};
			},
		},
		billing: {
			meters: {
				list: async () => ({ data: [], has_more: false }),
				create: async () => ({ id: "meter_1" }),
			},
		},
	};
	return { cli, priceCreates };
};

describe("createStripeArrearProrated per-currency", () => {
	test("eur: main + placeholder prices in eur, per-currency slots, base untouched", async () => {
		const { cli, priceCreates } = makeStripeCli();
		const price = allocatedPrice({
			currencies: { eur: { usage_tiers: [{ to: -1, amount: 9 }] } },
		});

		await createStripeArrearProrated({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			entitlements: [entitlement],
			curStripeProd: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(priceCreates).toHaveLength(2);
		expect(priceCreates[0].currency).toBe("eur");
		expect(priceCreates[0].unit_amount_decimal).toBe("900");
		// placeholder metered price also in eur
		expect(priceCreates[1].currency).toBe("eur");

		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.currencies.eur.stripe_price_id).toBe("price_1_eur");
		expect(config.currencies.eur.stripe_placeholder_price_id).toBe(
			"price_2_eur",
		);
		expect(config.stripe_price_id).toBeNull();
		expect(config.stripe_placeholder_price_id).toBeUndefined();
		expect(config.stripe_product_id).toBe("prod_shared");
	});

	test("base (default): top-level slots as before", async () => {
		const { cli, priceCreates } = makeStripeCli();
		const price = allocatedPrice({});

		await createStripeArrearProrated({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			entitlements: [entitlement],
			curStripeProd: { id: "prod_shared" } as never,
		});

		expect(priceCreates[0].currency).toBe("usd");
		expect(priceCreates[0].unit_amount_decimal).toBe("1000");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.stripe_price_id).toBe("price_1_usd");
		expect(config.stripe_placeholder_price_id).toBe("price_2_usd");
		expect(config.currencies).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
