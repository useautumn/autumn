import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	type BillingContext,
	BillingInterval,
	BillWhen,
	type FullCusProduct,
	type FullCustomerPrice,
	type Price,
	PriceType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	priceIds: [] as string[],
	currencies: [] as (string | undefined)[],
	productCalls: 0,
};

mock.module("@/external/stripe/createStripePrice/createStripePrice", () => ({
	createStripePriceIFNotExist: async ({
		price,
		currency,
	}: {
		price: Price;
		currency?: string;
	}) => {
		mockState.priceIds.push(price.id);
		mockState.currencies.push(currency);
	},
}));

mock.module("@/internal/products/productUtils", () => ({
	checkStripeProductExists: async () => {
		mockState.productCalls++;
	},
}));

import { initStripeResourcesForBillingPlan } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";

const fixedPrice = ({
	id,
	amount = 10,
}: {
	id: string;
	amount?: number;
}): Price => ({
	id,
	internal_product_id: "prod_internal",
	org_id: "org_1",
	created_at: 1,
	tier_behavior: null,
	is_custom: false,
	entitlement_id: null,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		stripe_price_id: null,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
	},
});

const prepaidPrice = ({ id }: { id: string }): Price => ({
	id,
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
		billing_units: 1,
		internal_feature_id: "feature_internal",
		feature_id: "messages",
		usage_tiers: [{ amount: 10, to: -1 }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: null,
		stripe_product_id: null,
		stripe_prepaid_price_v2_id: null,
	},
});

const customerPrice = ({
	id,
	price,
}: {
	id: string;
	price: Price;
}): FullCustomerPrice => ({
	id,
	internal_customer_id: "cus_internal",
	customer_product_id: "cus_prod_1",
	created_at: 1,
	price_id: price.id,
	price,
});

const customerProduct = ({
	customerPrices,
}: {
	customerPrices: FullCustomerPrice[];
}): FullCusProduct =>
	({
		id: "cus_prod_1",
		internal_customer_id: "cus_internal",
		customer_id: "cus_1",
		internal_product_id: "prod_internal",
		product_id: "pro",
		created_at: 1,
		updated_at: 1,
		status: "active",
		canceled: false,
		starts_at: 1,
		options: [],
		collection_method: "charge_automatically",
		quantity: 1,
		is_custom: false,
		billing_version: "v2",
		api_semver: null,
		external_id: null,
		customer_prices: customerPrices,
		customer_entitlements: [],
		product: {
			id: "pro",
			name: "Pro",
			description: null,
			is_add_on: false,
			is_default: false,
			version: 1,
			group: "",
			env: "sandbox",
			internal_id: "prod_internal",
			org_id: "org_1",
			created_at: 1,
			processor: null,
			base_variant_id: null,
			archived: false,
			config: { ignore_past_due: false },
			metadata: {},
		},
		free_trial: null,
	}) as FullCusProduct;

describe("initStripeResourcesForBillingPlan", () => {
	beforeEach(() => {
		mockState.priceIds = [];
		mockState.currencies = [];
		mockState.productCalls = 0;
	});

	test("uses preview Stripe IDs without initializing Stripe resources during dry run", async () => {
		const basePrice = fixedPrice({ id: "price_base" });
		const messagesPrice = prepaidPrice({ id: "price_messages" });
		const baseCustomerPrice = customerPrice({
			id: "cus_price_base",
			price: basePrice,
		});
		const messagesCustomerPrice = customerPrice({
			id: "cus_price_messages",
			price: messagesPrice,
		});
		const newCustomerProduct = customerProduct({
			customerPrices: [baseCustomerPrice, messagesCustomerPrice],
		});

		await initStripeResourcesForBillingPlan({
			ctx: {
				db: {},
				org: { id: "org_1" },
				env: "sandbox",
				logger: { debug: () => undefined },
			} as unknown as AutumnContext,
			billingContext: {
				dryRunStripe: true,
				fullCustomer: {
					internal_id: "cus_internal",
					customer_products: [],
				},
			} as unknown as BillingContext,
			autumnBillingPlan: {
				customerId: "cus_1",
				insertCustomerProducts: [newCustomerProduct],
			} as AutumnBillingPlan,
		});

		const messagesConfig = messagesPrice.config as UsagePriceConfig;

		expect(mockState.productCalls).toBe(0);
		expect(mockState.priceIds).toEqual([]);
		expect(newCustomerProduct.product.processor?.id).toStartWith(
			"prod_PREVIEW_",
		);
		expect(basePrice.config.stripe_price_id).toStartWith("price_PREVIEW_");
		expect(messagesConfig.stripe_price_id).toStartWith("price_PREVIEW_");
		expect(messagesConfig.stripe_product_id).toStartWith("prod_PREVIEW_");
		expect(messagesConfig.stripe_prepaid_price_v2_id).toStartWith(
			"price_PREVIEW_",
		);
	});

	test("uses preview Stripe IDs for patched customer products during dry run", async () => {
		const keptPrice = fixedPrice({ id: "price_kept" });
		const insertedPrice = prepaidPrice({ id: "price_inserted" });
		const originalCustomerProduct = customerProduct({
			customerPrices: [
				customerPrice({
					id: "cus_price_kept",
					price: keptPrice,
				}),
			],
		});
		const insertedCustomerPrice = customerPrice({
			id: "cus_price_inserted",
			price: insertedPrice,
		});

		await initStripeResourcesForBillingPlan({
			ctx: {
				db: {},
				org: { id: "org_1" },
				env: "sandbox",
				logger: { debug: () => undefined },
			} as unknown as AutumnContext,
			billingContext: {
				dryRunStripe: true,
				fullCustomer: {
					internal_id: "cus_internal",
					customer_products: [originalCustomerProduct],
				},
			} as unknown as BillingContext,
			autumnBillingPlan: {
				customerId: "cus_1",
				insertCustomerProducts: [],
				patchCustomerProducts: [
					{
						customerProduct: originalCustomerProduct,
						insertCustomerPrices: [insertedCustomerPrice],
						insertCustomerEntitlements: [],
						deleteCustomerPrices: [],
						deleteCustomerEntitlements: [],
					},
				],
			} as AutumnBillingPlan,
		});

		const insertedConfig = insertedPrice.config as UsagePriceConfig;

		expect(mockState.productCalls).toBe(0);
		expect(mockState.priceIds).toEqual([]);
		expect(originalCustomerProduct.product.processor?.id).toStartWith(
			"prod_PREVIEW_",
		);
		expect(keptPrice.config.stripe_price_id).toStartWith("price_PREVIEW_");
		expect(insertedConfig.stripe_price_id).toStartWith("price_PREVIEW_");
		expect(insertedConfig.stripe_product_id).toStartWith("prod_PREVIEW_");
		expect(insertedConfig.stripe_prepaid_price_v2_id).toStartWith(
			"price_PREVIEW_",
		);
	});

	test("does not initialize Stripe resources for zero fixed prices", async () => {
		const zeroPrice = fixedPrice({ id: "price_free", amount: 0 });
		const freeCustomerProduct = customerProduct({
			customerPrices: [
				customerPrice({
					id: "cus_price_free",
					price: zeroPrice,
				}),
			],
		});

		await initStripeResourcesForBillingPlan({
			ctx: {
				db: {},
				org: { id: "org_1" },
				env: "sandbox",
				logger: { debug: () => undefined },
			} as unknown as AutumnContext,
			billingContext: {
				fullCustomer: {
					internal_id: "cus_internal",
					customer_products: [],
				},
			} as unknown as BillingContext,
			autumnBillingPlan: {
				customerId: "cus_1",
				insertCustomerProducts: [freeCustomerProduct],
			} as AutumnBillingPlan,
		});

		expect(mockState.productCalls).toBe(0);
		expect(mockState.priceIds).toEqual([]);
		expect(zeroPrice.config.stripe_price_id).toBeNull();
	});

	test("omits zero fixed prices from Stripe item specs", () => {
		const zeroPrice = fixedPrice({ id: "price_free", amount: 0 });
		const freeCustomerProduct = customerProduct({
			customerPrices: [
				customerPrice({
					id: "cus_price_free",
					price: zeroPrice,
				}),
			],
		});

		const stripeItemSpecs = customerProductToStripeItemSpecs({
			ctx: { org: { default_currency: "usd" } } as unknown as AutumnContext,
			customerProduct: freeCustomerProduct,
		});

		expect(stripeItemSpecs).toEqual({
			oneOffItems: [],
			recurringItems: [],
		});
	});

	test("does not initialize Stripe resources for prices removed by a patch", async () => {
		const keptPrice = fixedPrice({ id: "price_kept" });
		const removedPrice = fixedPrice({ id: "price_removed" });
		const keptCustomerPrice = customerPrice({
			id: "cus_price_kept",
			price: keptPrice,
		});
		const removedCustomerPrice = customerPrice({
			id: "cus_price_removed",
			price: removedPrice,
		});
		const originalCustomerProduct = customerProduct({
			customerPrices: [keptCustomerPrice, removedCustomerPrice],
		});

		await initStripeResourcesForBillingPlan({
			ctx: {
				db: {},
				org: { id: "org_1" },
				env: "sandbox",
				logger: { debug: () => undefined },
			} as unknown as AutumnContext,
			billingContext: {
				fullCustomer: {
					internal_id: "cus_internal",
					customer_products: [originalCustomerProduct],
				},
			} as unknown as BillingContext,
			autumnBillingPlan: {
				customerId: "cus_1",
				insertCustomerProducts: [],
				patchCustomerProducts: [
					{
						customerProduct: originalCustomerProduct,
						insertCustomerPrices: [],
						insertCustomerEntitlements: [],
						deleteCustomerPrices: [removedCustomerPrice],
						deleteCustomerEntitlements: [],
					},
				],
			} as AutumnBillingPlan,
		});

		expect(mockState.priceIds).toContain("price_kept");
		expect(mockState.priceIds).not.toContain("price_removed");
	});

	test("forwards the customer's resolved currency into price creation", async () => {
		const basePrice = fixedPrice({ id: "price_base" });
		const newCustomerProduct = customerProduct({
			customerPrices: [
				customerPrice({ id: "cus_price_base", price: basePrice }),
			],
		});

		await initStripeResourcesForBillingPlan({
			ctx: {
				db: {},
				org: { id: "org_1", default_currency: "usd" },
				env: "sandbox",
				logger: { debug: () => undefined },
			} as unknown as AutumnContext,
			billingContext: {
				fullCustomer: {
					internal_id: "cus_internal",
					currency: "eur",
					customer_products: [],
				},
			} as unknown as BillingContext,
			autumnBillingPlan: {
				customerId: "cus_1",
				insertCustomerProducts: [newCustomerProduct],
			} as AutumnBillingPlan,
		});

		expect(mockState.currencies).toEqual(["eur"]);
	});
});

afterAll(() => {
	mock.restore();
});
