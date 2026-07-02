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

import { createStripePrepaid } from "@/external/stripe/createStripePrice/createStripePrepaid";

type CreateCall = Record<string, unknown>;

const makeStripeCli = (createdId: string) => {
	const calls: CreateCall[] = [];
	const cli = {
		prices: {
			create: async (params: CreateCall) => {
				calls.push(params);
				return { id: createdId, product: "prod_shared" };
			},
		},
	};
	return { cli, calls };
};

const entitlement = {
	id: "ent_1",
	internal_product_id: "prod_internal",
	internal_feature_id: "feature_internal",
	feature_id: "messages",
	allowance: 0,
	feature: { id: "messages", name: "Messages" },
} as unknown as EntitlementWithFeature;

const prepaidPrice = ({
	interval = BillingInterval.Month,
	currencies,
}: {
	interval?: BillingInterval;
	currencies?: Record<
		string,
		{ usage_tiers?: { to: number; amount: number }[] }
	>;
}): Price =>
	({
		id: "price_prepaid",
		internal_product_id: "prod_internal",
		org_id: "org_1",
		created_at: 1,
		tier_behavior: null,
		is_custom: false,
		entitlement_id: "ent_1",
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 100,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [
				{ to: 1000, amount: 10 },
				{ to: -1, amount: 8 },
			],
			interval,
			interval_count: 1,
			base_currency: "usd",
			currencies,
			stripe_price_id: null,
			stripe_product_id: null,
		},
	}) as unknown as Price;

const eurTiers = [
	{ to: 1000, amount: 9 },
	{ to: -1, amount: 7 },
];

const product = {
	name: "Pro",
	processor: { id: "prod_shared" },
} as unknown as Product;
const org = { default_currency: "usd" } as unknown as Organization;

describe("createStripePrepaid per-currency", () => {
	test("base (default): tiered price in usd from base tiers, top-level slots", async () => {
		const { cli, calls } = makeStripeCli("price_usd");
		const price = prepaidPrice({});

		await createStripePrepaid({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			entitlements: [entitlement],
			curStripeProd: { id: "prod_shared" } as never,
		});

		expect(calls[0].currency).toBe("usd");
		const tiers = calls[0].tiers as {
			unit_amount_decimal: string;
			up_to: number | "inf";
		}[];
		// tier.amount 10 → "1000" (cents), up_to 1000/100 units → 10
		expect(tiers[0].unit_amount_decimal).toBe("1000");
		expect(tiers[0].up_to).toBe(10);
		expect(tiers[1].unit_amount_decimal).toBe("800");
		expect(tiers[1].up_to).toBe("inf");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_price_id).toBe("price_usd");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies).toBeUndefined();
	});

	test("eur: tiered price in eur from currencies.eur tiers, per-currency slot", async () => {
		const { cli, calls } = makeStripeCli("price_eur");
		const price = prepaidPrice({
			currencies: { eur: { usage_tiers: eurTiers } },
		});

		await createStripePrepaid({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			entitlements: [entitlement],
			curStripeProd: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(calls[0].currency).toBe("eur");
		const tiers = calls[0].tiers as { unit_amount_decimal: string }[];
		expect(tiers[0].unit_amount_decimal).toBe("900");
		expect(tiers[1].unit_amount_decimal).toBe("700");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies.eur.stripe_price_id).toBe(
			"price_eur",
		);
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).stripe_price_id).toBeNull();
		// per-currency amounts must never overwrite the persisted base tiers
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).usage_tiers[0].amount).toBe(10);
	});

	test("eur one-off: unit amount from currencies.eur, per-currency slot", async () => {
		const { cli, calls } = makeStripeCli("price_eur_oneoff");
		const price = prepaidPrice({
			interval: BillingInterval.OneOff,
			currencies: { eur: { usage_tiers: [{ to: -1, amount: 7 }] } },
		});
		// one-off reads tiers[0] directly; give base a single tier too
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		(price.config as any).usage_tiers = [{ to: -1, amount: 8 }];

		await createStripePrepaid({
			db: {} as never,
			stripeCli: cli as never,
			price,
			product,
			org,
			entitlements: [entitlement],
			curStripeProd: { id: "prod_shared" } as never,
			currency: "eur",
		});

		expect(calls[0].currency).toBe("eur");
		expect(calls[0].unit_amount_decimal).toBe("700");
		// biome-ignore lint/suspicious/noExplicitAny: test config narrowing
		expect((price.config as any).currencies.eur.stripe_price_id).toBe(
			"price_eur_oneoff",
		);
	});
});

afterAll(() => {
	mock.restore();
});
