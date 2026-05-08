import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	type BillingContext,
	BillingInterval,
	type FullCusProduct,
	type FullCustomerPrice,
	type Price,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	priceIds: [] as string[],
};

mock.module("@/external/stripe/createStripePrice/createStripePrice", () => ({
	createStripePriceIFNotExist: async ({ price }: { price: Price }) => {
		mockState.priceIds.push(price.id);
	},
}));

mock.module("@/internal/products/productUtils", () => ({
	checkStripeProductExists: async () => undefined,
}));

import { initStripeResourcesForBillingPlan } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts";

const fixedPrice = ({ id }: { id: string }): Price => ({
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
		amount: 10,
		interval: BillingInterval.Month,
		stripe_price_id: null,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
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
		},
		free_trial: null,
	}) as FullCusProduct;

describe("initStripeResourcesForBillingPlan", () => {
	beforeEach(() => {
		mockState.priceIds = [];
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
			} as BillingContext,
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
});
