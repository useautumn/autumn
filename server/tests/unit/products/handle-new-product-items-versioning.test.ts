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

const orgId = "org_versioning";
const previousProductInternalId = "prod_internal_v1";
const newProductInternalId = "prod_internal_v2";
const now = 1_800_000_000_000;

const feature: Feature = {
	internal_id: "feat_internal_ai_credits",
	id: "ai_credits",
	name: "AI Credits",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	org_id: orgId,
	env: AppEnv.Sandbox,
	created_at: now,
	archived: false,
	event_names: [],
};

const previousEntitlement: Entitlement = {
	id: "ent_v1",
	org_id: orgId,
	created_at: now,
	is_custom: false,
	internal_product_id: previousProductInternalId,
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

const previousUsageConfig: UsagePriceConfig = {
	type: PriceType.Usage,
	bill_when: BillWhen.EndOfPeriod,
	billing_units: 1,
	should_prorate: false,
	internal_feature_id: feature.internal_id,
	feature_id: feature.id,
	usage_tiers: [{ amount: 0.1, to: TierInfinite }],
	interval: BillingInterval.Month,
	interval_count: 1,
	stripe_product_id: "prod_ai_credits",
	stripe_price_id: "price_ai_credits",
	stripe_meter_id: "meter_ai_credits",
	stripe_event_name: "ai_credits_used",
	stripe_empty_price_id: "price_ai_credits_empty",
};

const previousUsagePrice: Price = {
	id: "pr_v1",
	org_id: orgId,
	created_at: now,
	internal_product_id: previousProductInternalId,
	is_custom: false,
	config: previousUsageConfig,
	entitlement_id: previousEntitlement.id,
	proration_config: null,
	tier_behavior: null,
};

const previousFixedConfig: FixedPriceConfig = {
	type: PriceType.Fixed,
	amount: 500,
	interval: BillingInterval.Month,
	interval_count: 1,
	stripe_product_id: null,
	feature_id: null,
	internal_feature_id: null,
	stripe_price_id: "price_base_v1",
};

const previousFixedPrice: Price = {
	id: "pr_fixed_v1",
	org_id: orgId,
	created_at: now,
	internal_product_id: previousProductInternalId,
	is_custom: false,
	config: previousFixedConfig,
	proration_config: null,
};

const newProduct: Product = {
	id: "enterprise",
	name: "Enterprise",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 2,
	group: "",
	env: AppEnv.Sandbox,
	internal_id: newProductInternalId,
	org_id: orgId,
	created_at: now,
	processor: null,
	base_variant_id: null,
	archived: false,
	config: { ignore_past_due: false },
	metadata: {},
};

const baseItem: ProductItem = {
	price: 500,
	interval: ProductItemInterval.Month,
	interval_count: 1,
	price_id: previousFixedPrice.id,
};

const aiCreditsItem: ProductItem = {
	feature_id: feature.id,
	included_usage: 100,
	price: 0.1,
	interval: ProductItemInterval.Month,
	interval_count: 1,
	usage_model: "pay_per_use" as ProductItem["usage_model"],
	billing_units: 1,
	reset_usage_when_enabled: true,
	price_id: previousUsagePrice.id,
	entitlement_id: previousEntitlement.id,
};

const noopLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => noopLogger,
} as never;

describe("handleNewProductItems versioning carries forward Stripe IDs", () => {
	test("copies every Stripe resource field onto the new version when config matches", async () => {
		const result = await handleNewProductItems({
			db: {} as DrizzleCli,
			curPrices: [previousFixedPrice, previousUsagePrice],
			curEnts: [previousEntitlement],
			newItems: [baseItem, aiCreditsItem],
			features: [feature],
			product: newProduct,
			logger: noopLogger,
			isCustom: false,
			newVersion: true,
			saveToDb: false,
			multiCurrencyEnabled: true,
		});

		const fixedNew = result.prices.find(
			(price) => price.config.type === PriceType.Fixed,
		);
		const usageNew = result.prices.find(
			(price) => price.config.type === PriceType.Usage,
		);

		expect(fixedNew).toBeDefined();
		expect(usageNew).toBeDefined();
		expect((fixedNew?.config as FixedPriceConfig).stripe_price_id).toBe(
			"price_base_v1",
		);
		const usageConfig = usageNew?.config as UsagePriceConfig;
		expect(usageConfig.stripe_product_id).toBe("prod_ai_credits");
		expect(usageConfig.stripe_price_id).toBe("price_ai_credits");
		expect(usageConfig.stripe_meter_id).toBe("meter_ai_credits");
		expect(usageConfig.stripe_event_name).toBe("ai_credits_used");
		expect(usageConfig.stripe_empty_price_id).toBe("price_ai_credits_empty");
	});

	test("falls back to stripe_product_id only when the usage tier changes", async () => {
		const changedAiCreditsItem: ProductItem = {
			...aiCreditsItem,
			price: 0.2,
		};

		const result = await handleNewProductItems({
			db: {} as DrizzleCli,
			curPrices: [previousUsagePrice],
			curEnts: [previousEntitlement],
			newItems: [changedAiCreditsItem],
			features: [feature],
			product: newProduct,
			logger: noopLogger,
			isCustom: false,
			newVersion: true,
			saveToDb: false,
			multiCurrencyEnabled: true,
		});

		const usageNew = result.prices.find(
			(price) => price.config.type === PriceType.Usage,
		);
		expect(usageNew).toBeDefined();
		const usageConfig = usageNew?.config as UsagePriceConfig;
		expect(usageConfig.stripe_product_id).toBe("prod_ai_credits");
		expect(usageConfig.stripe_price_id).toBeUndefined();
		expect(usageConfig.stripe_meter_id).toBe("meter_ai_credits");
		expect(usageConfig.stripe_empty_price_id).toBeUndefined();
	});
});
