import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillingInterval,
	BillWhen,
	EntInterval,
	type Entitlement,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FixedPriceConfig,
	type Price,
	PriceType,
	type Product,
	type ProductItem,
	ProductItemInterval,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems";

const orgId = "org_custom_currencies";
const internalProductId = "prod_internal_enterprise";
const now = 1_800_000_000_000;

const feature: Feature = {
	internal_id: "feat_internal_api_calls",
	id: "api_calls",
	name: "API Calls",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	org_id: orgId,
	env: AppEnv.Sandbox,
	created_at: now,
	archived: false,
	event_names: [],
};

const catalogEntitlement: Entitlement = {
	id: "ent_api_calls",
	org_id: orgId,
	created_at: now,
	is_custom: false,
	internal_product_id: internalProductId,
	internal_feature_id: feature.internal_id,
	feature_id: feature.id,
	allowance: 100,
	allowance_type: AllowanceType.Fixed,
	interval: EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: undefined,
	usage_limit: null,
	rollover: null,
};

const catalogFixedPrice: Price = {
	id: "pr_base",
	org_id: orgId,
	created_at: now,
	internal_product_id: internalProductId,
	is_custom: false,
	config: {
		type: PriceType.Fixed,
		amount: 500,
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
		stripe_price_id: "price_base",
	} satisfies FixedPriceConfig,
	proration_config: null,
};

const catalogUsagePrice: Price = {
	id: "pr_api_calls",
	org_id: orgId,
	created_at: now,
	internal_product_id: internalProductId,
	is_custom: false,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		should_prorate: false,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		usage_tiers: [{ amount: 0.1, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_meter_id: "meter_api_calls",
	} satisfies UsagePriceConfig,
	entitlement_id: catalogEntitlement.id,
	proration_config: null,
	tier_behavior: null,
};

const product: Product = {
	id: "enterprise",
	name: "Enterprise",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	version_slug: "v1",
	active: true,
	deleted_at: null,
	previous_version_slug: null,
	group: "",
	env: AppEnv.Sandbox,
	internal_id: internalProductId,
	org_id: orgId,
	created_at: now,
	processor: null,
	base_variant_id: null,
	base_internal_product_id: null,
	archived: false,
	config: { ignore_past_due: false },
	metadata: {},
};

const baseItem: ProductItem = {
	price: 500,
	interval: ProductItemInterval.Month,
	interval_count: 1,
	price_id: catalogFixedPrice.id,
};

const apiCallsItem: ProductItem = {
	feature_id: feature.id,
	included_usage: 100,
	tiers: [{ amount: 0.1, to: TierInfinite }],
	interval: ProductItemInterval.Month,
	interval_count: 1,
	usage_model: "pay_per_use" as ProductItem["usage_model"],
	billing_units: 1,
	reset_usage_when_enabled: true,
	price_id: catalogUsagePrice.id,
	entitlement_id: catalogEntitlement.id,
};

const noopLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => noopLogger,
} as never;

const runCustom = (newItems: ProductItem[]) =>
	handleNewProductItems({
		db: {} as DrizzleCli,
		curPrices: [catalogFixedPrice, catalogUsagePrice],
		curEnts: [catalogEntitlement],
		newItems,
		features: [feature],
		product,
		logger: noopLogger,
		isCustom: true,
		multiCurrencyEnabled: true,
	});

describe("handleNewProductItems custom currencies", () => {
	test("currency added to a custom plan creates custom prices that offer it", async () => {
		const result = await runCustom([
			{
				...baseItem,
				base_currency: "usd",
				additional_currencies: [{ currency: "eur", amount: 450 }],
			},
			{
				...apiCallsItem,
				base_currency: "usd",
				tiers: [
					{
						amount: 0.1,
						to: TierInfinite,
						additional_currencies: [{ currency: "eur", amount: 0.09 }],
					},
				],
			},
		]);

		expect(result.customPrices).toHaveLength(2);
		for (const price of result.prices) {
			expect(price.is_custom).toBe(true);
			expect(price.config.currencies?.eur).toBeDefined();
		}
	});

	test("unchanged custom items still reuse the catalog prices", async () => {
		const result = await runCustom([baseItem, apiCallsItem]);

		expect(result.customPrices).toHaveLength(0);
		expect(result.prices.map((price) => price.id).sort()).toEqual(
			[catalogFixedPrice.id, catalogUsagePrice.id].sort(),
		);
	});
});
