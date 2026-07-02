import { describe, expect, mock, test } from "bun:test";
import {
	BillingInterval,
	type FullProduct,
	type Organization,
	type Price,
	PriceType,
} from "@autumn/shared";

mock.module("@server/internal/products/prices/PriceService", () => ({
	PriceService: {
		update: async () => undefined,
	},
}));

import { createStripeFixedPrice } from "@/external/stripe/createStripePrice/createStripeFixedPrice";

const makeStripeCli = (createdId: string, productId: string) => {
	const calls: Array<{
		currency: string;
		unit_amount: number;
		product: string;
	}> = [];
	const cli = {
		prices: {
			create: async (params: {
				currency: string;
				unit_amount: number;
				product: string;
			}) => {
				calls.push(params);
				return { id: createdId, product: productId };
			},
		},
	};
	return { cli, calls };
};

const fixedPrice = ({
	baseCurrency,
	currencies,
}: {
	baseCurrency?: string;
	currencies?: Record<string, { amount?: number }>;
}): Price =>
	({
		id: "price_1",
		internal_product_id: "prod_internal",
		org_id: "org_1",
		created_at: 1,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		config: {
			type: PriceType.Fixed,
			amount: 10,
			interval: BillingInterval.Month,
			base_currency: baseCurrency,
			currencies,
			stripe_price_id: null,
			stripe_product_id: null,
			feature_id: null,
			internal_feature_id: null,
		},
	}) as unknown as Price;

const product = { processor: { id: "prod_shared" } } as unknown as FullProduct;
const org = { default_currency: "usd" } as unknown as Organization;

describe("createStripeFixedPrice per-currency", () => {
	test("base currency (default): creates in org currency, writes the top-level slot", async () => {
		const { cli, calls } = makeStripeCli("price_usd", "prod_shared");
		const price = fixedPrice({ baseCurrency: "usd" });

		await createStripeFixedPrice({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
		});

		expect(calls[0].currency).toBe("usd");
		expect(calls[0].unit_amount).toBe(1000);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_price_id).toBe("price_usd");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies).toBeUndefined();
	});

	test("non-base currency: creates in that currency with its amount, writes currencies[ccy]", async () => {
		const { cli, calls } = makeStripeCli("price_eur", "prod_shared");
		const price = fixedPrice({
			baseCurrency: "usd",
			currencies: { eur: { amount: 9 } },
		});

		await createStripeFixedPrice({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			currency: "eur",
		});

		expect(calls[0].currency).toBe("eur");
		expect(calls[0].unit_amount).toBe(900);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies.eur.stripe_price_id).toBe(
			"price_eur",
		);
		// top-level slot stays untouched for a non-base currency
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_price_id).toBeNull();
	});

	test("no currency arg defaults to the config base currency, not the live org default", async () => {
		const { cli, calls } = makeStripeCli("price_gbp", "prod_shared");
		// base_currency gbp while the org default is usd: a legacy no-currency call
		// must resolve as base (gbp, top-level), not create a usd price.
		const price = fixedPrice({ baseCurrency: "gbp" });

		await createStripeFixedPrice({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
		});

		expect(calls[0].currency).toBe("gbp");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_price_id).toBe("price_gbp");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies).toBeUndefined();
	});
});
