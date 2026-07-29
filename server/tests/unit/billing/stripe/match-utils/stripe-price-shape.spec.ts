import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillWhen,
	BillingInterval,
	type Entitlement,
	type FixedPriceConfig,
	Infinite,
	type Organization,
	type Price,
	PriceType,
	TierBehavior,
} from "@autumn/shared";
import {
	autumnBasePriceToStripePriceShape,
	autumnConsumablePriceToStripePriceShape,
} from "@/internal/billing/v2/providers/stripe/utils/matchUtils/autumnPriceShape";
import {
	stripePriceShapesEqual,
	stripePriceToShape,
	type StripePriceShape,
} from "@/internal/billing/v2/providers/stripe/utils/matchUtils/stripePriceShape";
import type Stripe from "stripe";

const org = { default_currency: "usd" } as Organization;

const entitlement = ({
	allowance,
}: {
	allowance?: number | null;
} = {}): Entitlement =>
	({
		id: "ent_messages",
		internal_feature_id: "feature_messages_internal",
		internal_product_id: "product_internal",
		allowance_type:
			allowance == null ? AllowanceType.None : AllowanceType.Fixed,
		allowance,
		interval_count: 1,
	}) as Entitlement;

const consumablePrice = ({
	tiers = [{ to: Infinite, amount: 0.1 }],
	billingUnits = 1,
	tierBehavior = null,
}: {
	tiers?: Array<{ to: number | typeof Infinite; amount?: number; flat_amount?: number }>;
	billingUnits?: number;
	tierBehavior?: TierBehavior | null;
} = {}): Price =>
	({
		id: "price_messages",
		internal_product_id: "product_internal",
		tier_behavior: tierBehavior,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			billing_units: billingUnits,
			internal_feature_id: "feature_messages_internal",
			feature_id: "messages",
			usage_tiers: tiers,
			interval: BillingInterval.Month,
		},
		proration_config: null,
	}) as Price;

const stripePrice = ({
	product = "prod_messages",
	currency = "usd",
	billingScheme = "tiered",
	tiersMode = "graduated",
	interval = "month",
	intervalCount = 1,
	usageType = "metered",
	unitAmount,
	unitAmountDecimal,
	tiers,
}: {
	product?: string;
	currency?: string;
	billingScheme?: Stripe.Price.BillingScheme;
	tiersMode?: Stripe.Price.TiersMode | null;
	interval?: Stripe.Price.Recurring.Interval;
	intervalCount?: number;
	usageType?: "licensed" | "metered";
	unitAmount?: number | null;
	unitAmountDecimal?: string | null;
	tiers?: Stripe.Price.Tier[];
}): Stripe.Price =>
	({
		id: "price_stripe",
		active: true,
		product,
		currency,
		billing_scheme: billingScheme,
		tiers_mode: tiersMode,
		unit_amount: unitAmount ?? null,
		unit_amount_decimal: unitAmountDecimal ?? null,
		recurring: {
			interval,
			interval_count: intervalCount,
			usage_type: usageType,
		},
		tiers: tiers ? { data: tiers } : undefined,
	}) as Stripe.Price;

describe("autumnConsumablePriceToStripePriceShape", () => {
	test("includes entitlement allowance as the first zero-dollar graduated tier", () => {
		const shape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice({
				tiers: [
					{ to: 500, amount: 0.1 },
					{ to: Infinite, amount: 0.05 },
				],
			}),
			entitlement: entitlement({ allowance: 100 }),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});

		expect(shape).toEqual({
			product: "prod_messages",
			currency: "usd",
			billingScheme: "tiered",
			interval: "month",
			intervalCount: 1,
			recurringUsageType: "metered",
			tiersMode: "graduated",
			tiers: [
				{ upTo: 100, unitAmountDecimal: "0" },
				{ upTo: 600, unitAmountDecimal: "10" },
				{ upTo: "inf", unitAmountDecimal: "5" },
			],
			transformQuantity: undefined,
			unitAmountDecimal: undefined,
		} satisfies StripePriceShape);
	});

	test("normalizes a single generated tier with no included usage to a per-unit price", () => {
		const autumnShape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice(),
			entitlement: entitlement(),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});
		const stripeShape = stripePriceToShape({
			price: stripePrice({
				billingScheme: "per_unit",
				tiersMode: null,
				unitAmount: 10,
			}),
		});

		expect(autumnShape).toMatchObject({
			billingScheme: "per_unit",
			recurringUsageType: "metered",
			unitAmountDecimal: "10",
			tiers: undefined,
		});
		expect(stripePriceShapesEqual(stripeShape, autumnShape!)).toBe(true);
	});

	test("normalizes billing units into per-unit Stripe decimal amounts", () => {
		const autumnShape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice({
				billingUnits: 100,
				tiers: [{ to: Infinite, amount: 0.25 }],
			}),
			entitlement: entitlement(),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});
		const stripeShape = stripePriceToShape({
			price: stripePrice({
				billingScheme: "per_unit",
				tiersMode: null,
				unitAmountDecimal: "0.25",
			}),
		});

		expect(autumnShape).toMatchObject({
			billingScheme: "per_unit",
			unitAmountDecimal: "0.25",
		});
		expect(stripePriceShapesEqual(stripeShape, autumnShape!)).toBe(true);
	});

	test("keeps a single paid tier tiered when included usage creates the zero tier", () => {
		const shape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice(),
			entitlement: entitlement({ allowance: 100 }),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});

		expect(shape).toMatchObject({
			billingScheme: "tiered",
			tiersMode: "graduated",
			tiers: [
				{ upTo: 100, unitAmountDecimal: "0" },
				{ upTo: "inf", unitAmountDecimal: "10" },
			],
		});
	});

	test("matches an equivalent graduated metered Stripe price", () => {
		const autumnShape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice({
				tiers: [
					{ to: 500, amount: 0.1 },
					{ to: Infinite, amount: 0.05 },
				],
			}),
			entitlement: entitlement({ allowance: 100 }),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});
		const stripeShape = stripePriceToShape({
			price: stripePrice({
				tiers: [
					{ up_to: 100, unit_amount: 0, flat_amount: null },
					{ up_to: 600, unit_amount: 10, flat_amount: null },
					{ up_to: null, unit_amount: 5, flat_amount: null },
				] as Stripe.Price.Tier[],
			}),
		});

		expect(stripePriceShapesEqual(stripeShape, autumnShape!)).toBe(true);
	});

	test("does not match graduated Stripe tiers with flat amounts", () => {
		const autumnShape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice({
				tiers: [
					{ to: 500, amount: 0.1 },
					{ to: Infinite, amount: 0.05 },
				],
			}),
			entitlement: entitlement({ allowance: 100 }),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});
		const stripeShape = stripePriceToShape({
			price: stripePrice({
				tiers: [
					{ up_to: 100, unit_amount: 0, flat_amount: null },
					{ up_to: 600, unit_amount: 10, flat_amount: 1 },
					{ up_to: null, unit_amount: 5, flat_amount: null },
				] as Stripe.Price.Tier[],
			}),
		});

		expect(stripePriceShapesEqual(stripeShape, autumnShape!)).toBe(false);
	});

	test("rejects product, currency, interval, and usage-type mismatches", () => {
		const autumnShape = autumnConsumablePriceToStripePriceShape({
			price: consumablePrice(),
			entitlement: entitlement(),
			stripeProductId: "prod_messages",
			currency: "usd",
			org,
		});
		const mismatches = [
			stripePrice({ product: "prod_other", billingScheme: "per_unit", tiersMode: null, unitAmount: 10 }),
			stripePrice({ currency: "eur", billingScheme: "per_unit", tiersMode: null, unitAmount: 10 }),
			stripePrice({ interval: "year", billingScheme: "per_unit", tiersMode: null, unitAmount: 10 }),
			stripePrice({ usageType: "licensed", billingScheme: "per_unit", tiersMode: null, unitAmount: 10 }),
		];

		for (const mismatch of mismatches) {
			expect(
				stripePriceShapesEqual(
					stripePriceToShape({ price: mismatch }),
					autumnShape!,
				),
			).toBe(false);
		}
	});

	test("does not construct unsupported flat-amount or volume consumable shapes", () => {
		expect(
			autumnConsumablePriceToStripePriceShape({
				price: consumablePrice({
					tiers: [
						{ to: 500, amount: 0.1, flat_amount: 1 },
						{ to: Infinite, amount: 0.05 },
					],
				}),
				entitlement: entitlement({ allowance: 100 }),
				stripeProductId: "prod_messages",
				currency: "usd",
				org,
			}),
		).toBeNull();

		expect(
			autumnConsumablePriceToStripePriceShape({
				price: consumablePrice({ tierBehavior: TierBehavior.VolumeBased }),
				entitlement: entitlement(),
				stripeProductId: "prod_messages",
				currency: "usd",
				org,
			}),
		).toBeNull();
	});
});

const fixedPrice = (): Price & { config: FixedPriceConfig } =>
	({
		id: "price_base",
		internal_product_id: "product_internal",
		config: {
			type: PriceType.Fixed,
			amount: 20,
			interval: BillingInterval.Month,
			feature_id: null,
			internal_feature_id: null,
		},
		proration_config: null,
	}) as Price & { config: FixedPriceConfig };

describe("autumnBasePriceToStripePriceShape", () => {
	test("still constructs a simple recurring base-price shape", () => {
		const shape = autumnBasePriceToStripePriceShape({
			price: fixedPrice(),
			stripeProductId: "prod_base",
			currency: "usd",
		});

		expect(shape).toMatchObject({
			product: "prod_base",
			billingScheme: "per_unit",
			unitAmountDecimal: "2000",
		});
	});

	test("matches a Stripe price when the org currency is uppercase", () => {
		const autumnShape = autumnBasePriceToStripePriceShape({
			price: fixedPrice(),
			stripeProductId: "prod_base",
			currency: "EUR",
		});
		const stripeShape = stripePriceToShape({
			price: stripePrice({
				product: "prod_base",
				currency: "eur",
				billingScheme: "per_unit",
				tiersMode: null,
				usageType: "licensed",
				unitAmountDecimal: "2000",
			}),
		});

		expect(autumnShape).not.toBeNull();
		expect(stripePriceShapesEqual(autumnShape!, stripeShape)).toBe(true);
	});
});
