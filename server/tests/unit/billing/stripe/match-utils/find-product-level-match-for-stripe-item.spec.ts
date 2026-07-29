import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FullProduct,
	Infinite,
	type Price,
	PriceType,
} from "@autumn/shared";
import {
	findProductLevelMatchForStripeItem,
	type ProductLevelMatchCandidate,
	stripeItemMatchesBasePrice,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/findProductLevelMatchForStripeItem";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

const fixedPrice = ({
	id = "price_fixed",
	amount = 35,
	interval = BillingInterval.Month,
	intervalCount,
}: {
	id?: string;
	amount?: number;
	interval?: BillingInterval;
	intervalCount?: number;
} = {}): Price =>
	({
		id,
		internal_product_id: "prod_internal",
		config: {
			type: PriceType.Fixed,
			amount,
			interval,
			...(intervalCount !== undefined && { interval_count: intervalCount }),
			feature_id: null,
			internal_feature_id: null,
		},
		proration_config: null,
	}) as Price;

const usagePrice = ({
	stripeProductId,
}: {
	stripeProductId?: string;
} = {}): Price =>
	({
		id: "price_usage",
		internal_product_id: "prod_internal",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [{ to: Infinite, amount: 1 }],
			interval: BillingInterval.Month,
			...(stripeProductId && { stripe_product_id: stripeProductId }),
		},
		proration_config: null,
	}) as Price;

const stripeItem = ({
	stripeProductId = "prod_shared",
	unitAmountDecimal = "3500",
	currency = "usd",
	billingScheme = "per_unit",
	interval = "month",
	intervalCount = null,
	usageType = "licensed",
}: {
	stripeProductId?: string;
	unitAmountDecimal?: string | null;
	currency?: string | null;
	billingScheme?: "per_unit" | "tiered" | null;
	interval?: StripeItemSnapshot["recurring_interval"];
	intervalCount?: number | null;
	usageType?: StripeItemSnapshot["recurring_usage_type"];
} = {}): StripeItemSnapshot => ({
	id: "si_base",
	stripe_price_id: "price_external",
	stripe_product_id: stripeProductId,
	unit_amount: unitAmountDecimal ? Number(unitAmountDecimal) : null,
	unit_amount_decimal: unitAmountDecimal,
	currency,
	quantity: 1,
	billing_scheme: billingScheme,
	tiers_mode: null,
	tiers: null,
	recurring_interval: interval,
	recurring_interval_count: intervalCount,
	recurring_usage_type: usageType,
	metadata: {},
});

const product = ({
	id,
	price,
	baseVariantId = null,
}: {
	id: string;
	price: Price;
	baseVariantId?: string | null;
}): FullProduct =>
	({
		id,
		internal_id: `${id}_internal`,
		base_variant_id: baseVariantId,
		prices: [price],
	}) as FullProduct;

const candidate = ({
	id,
	price,
	stripeProductId = "prod_shared",
	baseVariantId = null,
}: {
	id: string;
	price: Price;
	stripeProductId?: string;
	baseVariantId?: string | null;
}): ProductLevelMatchCandidate => ({
	product: product({ id, price, baseVariantId }),
	matched_on: {
		type: "stripe_product_id",
		stripe_product_id: stripeProductId,
	},
});

describe("stripeItemMatchesBasePrice", () => {
	test("matches an equivalent fixed monthly base price", () => {
		expect(
			stripeItemMatchesBasePrice({
				item: stripeItem(),
				basePrice: fixedPrice(),
				stripeProductId: "prod_shared",
			}),
		).toBe(true);
	});

	test("treats Stripe's implicit interval_count=1 as equivalent to Autumn's default", () => {
		expect(
			stripeItemMatchesBasePrice({
				item: stripeItem({ intervalCount: null }),
				basePrice: fixedPrice({ intervalCount: undefined }),
				stripeProductId: "prod_shared",
			}),
		).toBe(true);
	});

	test("uses zero-decimal currency conversion", () => {
		expect(
			stripeItemMatchesBasePrice({
				item: stripeItem({ currency: "jpy", unitAmountDecimal: "3500" }),
				basePrice: fixedPrice({ amount: 3500 }),
				stripeProductId: "prod_shared",
			}),
		).toBe(true);
	});

	test("does not match different product, amount, interval, or interval count", () => {
		const mismatches = [
			{
				item: stripeItem(),
				price: fixedPrice(),
				stripeProductId: "prod_other",
			},
			{
				item: stripeItem({ unitAmountDecimal: "3600" }),
				price: fixedPrice(),
				stripeProductId: "prod_shared",
			},
			{
				item: stripeItem({ interval: "year" }),
				price: fixedPrice(),
				stripeProductId: "prod_shared",
			},
			{
				item: stripeItem({ intervalCount: 2 }),
				price: fixedPrice(),
				stripeProductId: "prod_shared",
			},
			{
				item: stripeItem(),
				price: fixedPrice({ intervalCount: 2 }),
				stripeProductId: "prod_shared",
			},
		];

		for (const mismatch of mismatches) {
			expect(
				stripeItemMatchesBasePrice({
					item: mismatch.item,
					basePrice: mismatch.price,
					stripeProductId: mismatch.stripeProductId,
				}),
			).toBe(false);
		}
	});

	test("rejects tiered Stripe prices and prices with missing shape fields", () => {
		const invalidItems = [
			stripeItem({ billingScheme: "tiered" }),
			stripeItem({ currency: null }),
			stripeItem({ interval: null }),
			stripeItem({ unitAmountDecimal: null }),
		];

		for (const item of invalidItems) {
			expect(
				stripeItemMatchesBasePrice({
					item,
					basePrice: fixedPrice(),
					stripeProductId: "prod_shared",
				}),
			).toBe(false);
		}
	});

	test("rejects non-recurring fixed prices and usage prices", () => {
		expect(
			stripeItemMatchesBasePrice({
				item: stripeItem(),
				basePrice: fixedPrice({ interval: BillingInterval.OneOff }),
				stripeProductId: "prod_shared",
			}),
		).toBe(false);

		expect(
			stripeItemMatchesBasePrice({
				item: stripeItem(),
				basePrice: usagePrice(),
				stripeProductId: "prod_shared",
			}),
		).toBe(false);
	});
});

describe("findProductLevelMatchForStripeItem", () => {
	test("keeps legacy behavior when there is only one product-level candidate", () => {
		const onlyCandidate = candidate({
			id: "base",
			price: fixedPrice({ amount: 20 }),
		});

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem(),
			candidates: [onlyCandidate],
		});

		expect(match?.product).toBe(onlyCandidate.product);
		expect(match?.matched_on).toBe(onlyCandidate.matched_on);
		expect(match?.priceMatch).toBeNull();
	});

	test("single candidate with a claim-less metered item stays unmatched instead of becoming a custom base", () => {
		const onlyCandidate = candidate({
			id: "base",
			price: fixedPrice({ amount: 20 }),
		});

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem({ usageType: "metered", unitAmountDecimal: null }),
			candidates: [onlyCandidate],
		});

		expect(match).toBeNull();
	});

	test("selects the unique candidate whose base price matches the Stripe item", () => {
		const variantBasePrice = fixedPrice({ id: "price_variant", amount: 35 });
		const base = candidate({
			id: "base",
			price: fixedPrice({ id: "price_base", amount: 20 }),
		});
		const variant = candidate({
			id: "variant",
			price: variantBasePrice,
		});

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem(),
			candidates: [base, variant],
		});

		expect(match?.product).toBe(variant.product);
		expect(match?.matched_on).toBe(variant.matched_on);
		expect(match?.priceMatch?.price).toBe(variantBasePrice);
		expect(match?.priceMatch?.matched_on.type).toBe("stripe_base_price_shape");
	});

	test("resolves a metered item to the unique candidate with a keyed usage price", () => {
		const keyedUsagePrice = usagePrice({ stripeProductId: "prod_shared" });
		const withKeyedPrice: ProductLevelMatchCandidate = {
			product: product({ id: "keyed", price: keyedUsagePrice }),
			matched_on: {
				type: "stripe_product_id",
				stripe_product_id: "prod_shared",
			},
		};
		const withoutKeyedPrice = candidate({
			id: "unkeyed",
			price: fixedPrice({ amount: 20 }),
		});

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem({ usageType: "metered", unitAmountDecimal: null }),
			candidates: [withoutKeyedPrice, withKeyedPrice],
		});

		expect(match?.product).toBe(withKeyedPrice.product);
		expect(match?.priceMatch?.price).toBe(keyedUsagePrice);
		expect(match?.priceMatch?.matched_on.type).toBe("stripe_product_id");
	});

	test("does not guess when multiple candidates match the same base price shape", () => {
		const variantA = candidate({
			id: "variant_a",
			price: fixedPrice({ id: "price_variant_a", amount: 35 }),
		});
		const variantB = candidate({
			id: "variant_b",
			price: fixedPrice({ id: "price_variant_b", amount: 35 }),
		});

		expect(
			findProductLevelMatchForStripeItem({
				item: stripeItem(),
				candidates: [variantA, variantB],
			}),
		).toBeNull();
	});

	test("falls back to the first base plan when no candidate claims the item", () => {
		const base = candidate({ id: "base", price: fixedPrice({ amount: 20 }) });
		const other = candidate({ id: "other", price: fixedPrice({ amount: 40 }) });

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem(),
			candidates: [base, other],
		});

		expect(match?.product).toBe(base.product);
		expect(match?.priceMatch).toBeNull();
	});

	test("base-plan fallback prefers the base plan over its variants", () => {
		const variantA = candidate({
			id: "variant_a",
			price: fixedPrice({ amount: 20 }),
			baseVariantId: "base",
		});
		const base = candidate({ id: "base", price: fixedPrice({ amount: 40 }) });
		const variantB = candidate({
			id: "variant_b",
			price: fixedPrice({ amount: 80 }),
			baseVariantId: "base",
		});

		const match = findProductLevelMatchForStripeItem({
			item: stripeItem(),
			candidates: [variantA, base, variantB],
		});

		expect(match?.product).toBe(base.product);
		expect(match?.priceMatch).toBeNull();
	});

	test("base-plan fallback stays null for metered items and variant-only candidates", () => {
		const variants = [
			candidate({
				id: "variant_a",
				price: fixedPrice({ amount: 20 }),
				baseVariantId: "base",
			}),
			candidate({
				id: "variant_b",
				price: fixedPrice({ amount: 40 }),
				baseVariantId: "base",
			}),
		];

		expect(
			findProductLevelMatchForStripeItem({
				item: stripeItem(),
				candidates: variants,
			}),
		).toBeNull();

		expect(
			findProductLevelMatchForStripeItem({
				item: stripeItem({ usageType: "metered" }),
				candidates: [
					candidate({ id: "base", price: fixedPrice({ amount: 20 }) }),
					candidate({ id: "other", price: fixedPrice({ amount: 40 }) }),
				],
			}),
		).toBeNull();
	});

	test("returns null for an empty candidate set", () => {
		expect(
			findProductLevelMatchForStripeItem({
				item: stripeItem(),
				candidates: [],
			}),
		).toBeNull();
	});
});
