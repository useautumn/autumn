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

import { createStripeEmptyPrice } from "@/external/stripe/createStripePrice/createStripeEmptyPrice";
import {
	createStripeInArrearPrice,
	priceToInArrearTiers,
} from "@/external/stripe/createStripePrice/createStripeInArrear";

const consumablePrice = ({
	currencies,
}: {
	currencies?: Record<
		string,
		{ usage_tiers?: { to: number; amount: number; flat_amount?: number }[] }
	>;
}): Price =>
	({
		id: "price_consumable",
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
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [
				{ to: 1000, amount: 0.1 },
				{ to: -1, amount: 0.08 },
			],
			interval: BillingInterval.Month,
			interval_count: 1,
			base_currency: "usd",
			currencies,
			stripe_price_id: null,
			stripe_product_id: null,
			stripe_meter_id: null,
		},
	}) as unknown as Price;

const eurTiers = [
	{ to: 1000, amount: 0.09 },
	{ to: -1, amount: 0.07 },
];

const entitlement = {
	id: "ent_1",
	internal_product_id: "prod_internal",
	internal_feature_id: "feature_internal",
	allowance: 100,
	feature: { id: "messages", name: "Messages" },
} as unknown as EntitlementWithFeature;

const org = { default_currency: "usd" } as unknown as Organization;
const product = {
	name: "Pro",
	processor: { id: "prod_shared" },
} as unknown as Product;

describe("priceToInArrearTiers per-currency", () => {
	test("default: base amounts, allowance-shifted boundaries", () => {
		const tiers = priceToInArrearTiers({
			price: consumablePrice({}),
			entitlement,
			org,
		});
		expect(tiers[0]).toEqual({ unit_amount: 0, up_to: 100 });
		expect(tiers[1].unit_amount_decimal).toBe("10");
		expect(tiers[1].up_to).toBe(1100);
		expect(tiers[2].unit_amount_decimal).toBe("8");
	});

	test("currency eur: eur amounts, same shifted boundaries, base config untouched", () => {
		const price = consumablePrice({
			currencies: { eur: { usage_tiers: eurTiers } },
		});
		const tiers = priceToInArrearTiers({
			price,
			entitlement,
			org,
			currency: "eur",
		});
		expect(tiers[0]).toEqual({ unit_amount: 0, up_to: 100 });
		expect(tiers[1].unit_amount_decimal).toBe("9");
		expect(tiers[1].up_to).toBe(1100);
		expect(tiers[2].unit_amount_decimal).toBe("7");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).usage_tiers[0].to).toBe(1000);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies.eur.usage_tiers[0].to).toBe(1000);
	});

	test("per-currency flat_amount converts in the target currency", () => {
		const price = consumablePrice({
			currencies: {
				eur: { usage_tiers: [{ to: -1, amount: 0.09, flat_amount: 5 }] },
			},
		});
		const tiers = priceToInArrearTiers({
			price,
			entitlement: { ...entitlement, allowance: 0 },
			org,
			currency: "eur",
		});
		expect(tiers[0].unit_amount_decimal).toBe("9");
		expect(tiers[0].flat_amount_decimal).toBe("500");
	});

	test("zero-decimal currency (jpy): amounts are not scaled by 100", () => {
		const price = consumablePrice({
			currencies: { jpy: { usage_tiers: [{ to: -1, amount: 1000 }] } },
		});
		const tiers = priceToInArrearTiers({
			price,
			entitlement: { ...entitlement, allowance: 0 },
			org,
			currency: "jpy",
		});
		expect(tiers[0].unit_amount_decimal).toBe("1000");
	});
});

describe("createStripeInArrearPrice per-currency", () => {
	const makeStripeCli = () => {
		const priceCreates: Record<string, unknown>[] = [];
		const meterCreates: Record<string, unknown>[] = [];
		const cli = {
			prices: {
				create: async (params: Record<string, unknown>) => {
					priceCreates.push(params);
					return { id: `price_${params.currency}`, product: "prod_shared" };
				},
			},
			billing: {
				meters: {
					list: async () => ({ data: [], has_more: false }),
					create: async (params: Record<string, unknown>) => {
						meterCreates.push(params);
						return { id: "meter_1" };
					},
				},
			},
		};
		return { cli, priceCreates, meterCreates };
	};

	const logger = {
		info: () => undefined,
		error: () => undefined,
	};

	test("eur: creates eur price on the shared meter, writes currencies.eur slot", async () => {
		const { cli, priceCreates } = makeStripeCli();
		const price = consumablePrice({
			currencies: { eur: { usage_tiers: eurTiers } },
		});

		await createStripeInArrearPrice({
			db: {} as never,
			stripeCli: cli as never,
			product,
			price,
			entitlements: [entitlement],
			org,
			logger,
			curStripePrice: null,
			curStripeProduct: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(priceCreates).toHaveLength(1);
		expect(priceCreates[0].currency).toBe("eur");
		const tiers = priceCreates[0].tiers as { unit_amount_decimal?: string }[];
		expect(tiers[1].unit_amount_decimal).toBe("9");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.currencies.eur.stripe_price_id).toBe("price_eur");
		expect(config.stripe_price_id).toBeNull();
		expect(config.stripe_meter_id).toBe("meter_1");
		expect(config.stripe_product_id).toBe("prod_shared");
	});
});

describe("createStripeEmptyPrice per-currency", () => {
	test("eur: zero-amount eur price written to currencies.eur empty slot", async () => {
		const priceCreates: Record<string, unknown>[] = [];
		const cli = {
			prices: {
				create: async (params: Record<string, unknown>) => {
					priceCreates.push(params);
					return { id: "price_empty_eur" };
				},
			},
		};
		const price = consumablePrice({
			currencies: { eur: { usage_tiers: eurTiers } },
		});
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		(price.config as any).stripe_product_id = "prod_shared";

		await createStripeEmptyPrice({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			logger: { info: () => undefined, error: () => undefined },
			currency: "eur",
		});

		expect(priceCreates[0].currency).toBe("eur");
		expect(priceCreates[0].unit_amount).toBe(0);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.currencies.eur.stripe_empty_price_id).toBe("price_empty_eur");
		expect(config.stripe_empty_price_id).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
