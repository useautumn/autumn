import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FullProduct,
	type Price,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const stripeCreates: Record<string, unknown>[] = [];

mock.module("@server/internal/products/prices/PriceService", () => ({
	PriceService: { update: async () => undefined },
}));
mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		prices: {
			create: async (params: Record<string, unknown>) => {
				stripeCreates.push(params);
				return { id: "price_v2_eur", product: "prod_shared" };
			},
		},
	}),
}));

import { createStripePrepaidPriceV2 } from "@/external/stripe/createStripePrice/createStripePrepaidPriceV2";

const makePrice = ({
	currencies,
	stripePriceId,
}: {
	currencies?: Record<string, Record<string, unknown>>;
	stripePriceId?: string | null;
}): Price =>
	({
		id: "price_prepaid",
		internal_product_id: "prod_internal",
		entitlement_id: "ent_1",
		tier_behavior: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [{ to: -1, amount: 10 }],
			interval: BillingInterval.Month,
			base_currency: "usd",
			currencies,
			stripe_price_id: stripePriceId ?? null,
			stripe_product_id: "prod_shared",
		},
	}) as unknown as Price;

const makeProduct = ({ allowance }: { allowance: number }): FullProduct =>
	({
		name: "Pro",
		entitlements: [
			{
				id: "ent_1",
				internal_product_id: "prod_internal",
				internal_feature_id: "feature_internal",
				allowance,
				feature: { id: "messages", name: "Messages" },
			},
		],
	}) as unknown as FullProduct;

const ctx = {
	org: { default_currency: "usd" },
	env: "sandbox",
	db: {},
} as unknown as AutumnContext;

describe("createStripePrepaidPriceV2 per-currency", () => {
	test("no allowance + eur: copies currencies.eur price id into currencies.eur v2 slot", async () => {
		stripeCreates.length = 0;
		const price = makePrice({
			currencies: {
				eur: {
					usage_tiers: [{ to: -1, amount: 9 }],
					stripe_price_id: "price_eur",
				},
			},
			stripePriceId: "price_usd",
		});

		await createStripePrepaidPriceV2({
			ctx,
			price,
			product: makeProduct({ allowance: 0 }),
			currentStripeProduct: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(stripeCreates).toHaveLength(0);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.currencies.eur.stripe_prepaid_price_v2_id).toBe("price_eur");
		expect(config.stripe_prepaid_price_v2_id).toBeUndefined();
	});

	test("no allowance default: copies top-level price id into top-level v2 slot", async () => {
		stripeCreates.length = 0;
		const price = makePrice({ stripePriceId: "price_usd" });

		await createStripePrepaidPriceV2({
			ctx,
			price,
			product: makeProduct({ allowance: 0 }),
			currentStripeProduct: { id: "prod_shared" } as never,
		});

		expect(stripeCreates).toHaveLength(0);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_prepaid_price_v2_id).toBe("price_usd");
	});

	test("allowance + eur: creates eur price with free leading tier, writes currencies.eur v2 slot", async () => {
		stripeCreates.length = 0;
		const price = makePrice({
			currencies: { eur: { usage_tiers: [{ to: -1, amount: 9 }] } },
			stripePriceId: "price_usd",
		});

		await createStripePrepaidPriceV2({
			ctx,
			price,
			product: makeProduct({ allowance: 100 }),
			currentStripeProduct: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(stripeCreates).toHaveLength(1);
		expect(stripeCreates[0].currency).toBe("eur");
		const tiers = stripeCreates[0].tiers as {
			unit_amount_decimal: string;
			up_to: number | "inf";
		}[];
		expect(tiers[0]).toEqual({ unit_amount_decimal: "0", up_to: 100 });
		expect(tiers[1].unit_amount_decimal).toBe("900");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		const config = price.config as any;
		expect(config.currencies.eur.stripe_prepaid_price_v2_id).toBe(
			"price_v2_eur",
		);
		expect(config.stripe_prepaid_price_v2_id).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
