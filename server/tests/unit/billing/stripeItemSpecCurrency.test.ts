import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	BillingInterval,
	BillWhen,
	type FullCusProduct,
	type FullCustomerPrice,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusPriceToStripeItemSpec } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusPriceToStripeItemSpec";

const ctx = { org: { default_currency: "usd" } } as unknown as AutumnContext;

const eurContext = {
	fullCustomer: { currency: "eur" },
} as unknown as BillingContext;

const baseProduct = {
	id: "pro",
	name: "Pro",
	internal_id: "prod_internal",
	processor: { id: "prod_shared" },
};

// biome-ignore lint/suspicious/noExplicitAny: compact test fixtures
const makeFixed = ({ currencies }: { currencies?: any }) => {
	const price = {
		id: "price_fixed",
		internal_product_id: "prod_internal",
		entitlement_id: null,
		tier_behavior: null,
		config: {
			type: PriceType.Fixed,
			amount: 10,
			interval: BillingInterval.Month,
			base_currency: "usd",
			currencies,
			stripe_price_id: "price_usd",
			stripe_product_id: "prod_shared",
		},
	};
	const cusPrice = {
		id: "cus_price_1",
		customer_product_id: "cus_prod_1",
		price_id: price.id,
		price,
	} as unknown as FullCustomerPrice;
	const cusProduct = {
		id: "cus_prod_1",
		product: baseProduct,
		customer_prices: [cusPrice],
		customer_entitlements: [],
		options: [],
	} as unknown as FullCusProduct;
	return { cusPrice, cusProduct };
};

// biome-ignore lint/suspicious/noExplicitAny: compact test fixtures
const makeUsage = ({
	billWhen,
	shouldProrate = false,
	configOverrides,
	optionsQuantity,
}: {
	billWhen: BillWhen;
	shouldProrate?: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: compact test fixtures
	configOverrides?: Record<string, any>;
	optionsQuantity?: number;
}) => {
	const entitlement = {
		id: "ent_1",
		internal_product_id: "prod_internal",
		internal_feature_id: "feature_internal",
		feature_id: "messages",
		allowance: 0,
		feature: {
			id: "messages",
			name: "Messages",
			internal_id: "feature_internal",
		},
	};
	const price = {
		id: "price_usage",
		internal_product_id: "prod_internal",
		entitlement_id: "ent_1",
		tier_behavior: null,
		config: {
			type: PriceType.Usage,
			bill_when: billWhen,
			should_prorate: shouldProrate,
			billing_units: 1,
			internal_feature_id: "feature_internal",
			feature_id: "messages",
			usage_tiers: [{ to: -1, amount: 0.1 }],
			interval: BillingInterval.Month,
			base_currency: "usd",
			stripe_product_id: "prod_shared",
			...configOverrides,
		},
	};
	const cusPrice = {
		id: "cus_price_1",
		customer_product_id: "cus_prod_1",
		price_id: price.id,
		price,
	} as unknown as FullCustomerPrice;
	const cusEnt = {
		id: "cus_ent_1",
		customer_product_id: "cus_prod_1",
		entitlement,
		balance: 0,
		entities: null,
	};
	const cusProduct = {
		id: "cus_prod_1",
		internal_entity_id: null,
		product: baseProduct,
		customer_prices: [cusPrice],
		customer_entitlements: [cusEnt],
		options: optionsQuantity
			? [{ feature_id: "messages", quantity: optionsQuantity }]
			: [],
	} as unknown as FullCusProduct;
	// biome-ignore lint/suspicious/noExplicitAny: link cusEnt back to its product
	(cusEnt as any).customer_product = cusProduct;
	return { cusPrice, cusProduct };
};

describe("item specs read per-currency stripe ids", () => {
	test("fixed: eur customer resolves the currencies.eur price id", () => {
		const { cusPrice, cusProduct } = makeFixed({
			currencies: { eur: { amount: 9, stripe_price_id: "price_eur" } },
		});

		const spec = cusPriceToStripeItemSpec({
			ctx,
			cusPrice,
			cusProduct,
			billingContext: eurContext,
		});

		expect(spec?.stripePriceId).toBe("price_eur");
	});

	test("fixed: no billing context falls back to the org default (top-level slot)", () => {
		const { cusPrice, cusProduct } = makeFixed({
			currencies: { eur: { amount: 9, stripe_price_id: "price_eur" } },
		});

		const spec = cusPriceToStripeItemSpec({ ctx, cusPrice, cusProduct });

		expect(spec?.stripePriceId).toBe("price_usd");
	});

	test("consumable: eur resolves per-currency price id, falling back to per-currency empty id", () => {
		const withPrice = makeUsage({
			billWhen: BillWhen.EndOfPeriod,
			configOverrides: {
				stripe_price_id: "price_usd",
				currencies: {
					eur: {
						usage_tiers: [{ to: -1, amount: 0.09 }],
						stripe_price_id: "price_eur",
					},
				},
			},
		});
		expect(
			cusPriceToStripeItemSpec({
				ctx,
				cusPrice: withPrice.cusPrice,
				cusProduct: withPrice.cusProduct,
				billingContext: eurContext,
			})?.stripePriceId,
		).toBe("price_eur");

		const emptyOnly = makeUsage({
			billWhen: BillWhen.EndOfPeriod,
			configOverrides: {
				stripe_price_id: "price_usd",
				currencies: {
					eur: {
						usage_tiers: [{ to: -1, amount: 0.09 }],
						stripe_empty_price_id: "price_eur_empty",
					},
				},
			},
		});
		expect(
			cusPriceToStripeItemSpec({
				ctx,
				cusPrice: emptyOnly.cusPrice,
				cusProduct: emptyOnly.cusProduct,
				billingContext: eurContext,
			})?.stripePriceId,
		).toBe("price_eur_empty");
	});

	test("allocated: eur resolves the per-currency price id", () => {
		const { cusPrice, cusProduct } = makeUsage({
			billWhen: BillWhen.EndOfPeriod,
			shouldProrate: true,
			configOverrides: {
				stripe_price_id: "price_usd",
				currencies: {
					eur: {
						usage_tiers: [{ to: -1, amount: 0.09 }],
						stripe_price_id: "price_eur",
					},
				},
			},
		});

		const spec = cusPriceToStripeItemSpec({
			ctx,
			cusPrice,
			cusProduct,
			billingContext: eurContext,
		});

		expect(spec?.stripePriceId).toBe("price_eur");
	});

	test("prepaid: eur resolves the per-currency prepaid v2 id", () => {
		const { cusPrice, cusProduct } = makeUsage({
			billWhen: BillWhen.StartOfPeriod,
			optionsQuantity: 2,
			configOverrides: {
				stripe_price_id: "price_usd",
				stripe_prepaid_price_v2_id: "price_v2_usd",
				currencies: {
					eur: {
						usage_tiers: [{ to: -1, amount: 0.09 }],
						stripe_price_id: "price_eur",
						stripe_prepaid_price_v2_id: "price_v2_eur",
					},
				},
			},
		});

		const spec = cusPriceToStripeItemSpec({
			ctx,
			cusPrice,
			cusProduct,
			billingContext: eurContext,
		});

		expect(spec?.stripePriceId).toBe("price_v2_eur");
	});
});
