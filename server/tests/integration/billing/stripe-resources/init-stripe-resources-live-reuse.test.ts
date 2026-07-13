/**
 * Live init should carry existing Stripe resources, but never create new ones.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillWhen,
	BillingInterval,
	EntInterval,
	FeatureUsageType,
	type FullProduct,
	type Price,
	PriceType,
	ProcessorType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { constructMeteredFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { constructProduct } from "@/internal/products/productUtils.js";
import { generateId } from "@/utils/genUtils.js";

const liveCtx = async () => {
	let features = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: AppEnv.Live,
	});

	if (!features.some((feature) => feature.id === TestFeature.Messages)) {
		await FeatureService.insert({
			db: ctx.db,
			logger: ctx.logger,
			data: constructMeteredFeature({
				featureId: TestFeature.Messages,
				orgId: ctx.org.id,
				env: AppEnv.Live,
				usageType: FeatureUsageType.Single,
			}),
		});
		features = await FeatureService.list({
			db: ctx.db,
			orgId: ctx.org.id,
			env: AppEnv.Live,
		});
	}

	return {
		...ctx,
		env: AppEnv.Live,
		features,
		org: {
			...ctx.org,
			config: {
				...ctx.org.config,
				disable_stripe_writes: false,
			},
		},
	};
};

const createLiveProductWithReusablePrice = async ({
	planId,
}: {
	planId: string;
}) => {
	const testCtx = await liveCtx();
	const feature = testCtx.features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	if (!feature) throw new Error("messages feature missing");

	const product = constructProduct({
		productData: {
			id: planId,
			name: `Live Stripe Reuse ${planId}`,
			group: `group_${planId}`,
			is_add_on: false,
			is_default: false,
			free_trial: null,
			items: [],
		},
		orgId: testCtx.org.id,
		env: testCtx.env,
		processor: { type: ProcessorType.Stripe, id: `prod_${planId}` },
	});
	await ProductService.insert({ db: testCtx.db, product });

	const sourceEntId = generateId("ent");
	const targetEntId = generateId("ent");
	const sourcePriceId = generateId("pr");
	const targetPriceId = generateId("pr");
	const entitlementShape = {
		org_id: testCtx.org.id,
		created_at: Date.now(),
		is_custom: false,
		internal_product_id: product.internal_id,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		allowance: 100,
		allowance_type: AllowanceType.Fixed,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		usage_limit: null,
		rollover: null,
	};
	await EntitlementService.insert({
		db: testCtx.db,
		data: [
			{ ...entitlementShape, id: sourceEntId },
			{ ...entitlementShape, id: targetEntId },
		],
	});

	const baseConfig: UsagePriceConfig = {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		should_prorate: false,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		usage_tiers: [{ amount: 0.1, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
	};
	await PriceService.insert({
		db: testCtx.db,
		data: [
			{
				id: sourcePriceId,
				org_id: testCtx.org.id,
				created_at: Date.now(),
				internal_product_id: product.internal_id,
				is_custom: false,
				entitlement_id: sourceEntId,
				proration_config: null,
				tier_behavior: null,
				config: {
					...baseConfig,
					stripe_product_id: `prod_feature_${planId}`,
					stripe_price_id: `price_${planId}`,
					stripe_meter_id: `mtr_${planId}`,
					stripe_event_name: `event_${planId}`,
				},
			},
			{
				id: targetPriceId,
				org_id: testCtx.org.id,
				created_at: Date.now(),
				internal_product_id: product.internal_id,
				is_custom: false,
				entitlement_id: targetEntId,
				proration_config: null,
				tier_behavior: null,
				config: baseConfig,
			},
		],
	});

	return ProductService.getFull({
		db: testCtx.db,
		idOrInternalId: product.id,
		orgId: testCtx.org.id,
		env: testCtx.env,
	}) as Promise<FullProduct>;
};

const createLiveProductWithoutStripeResources = async ({
	planId,
}: {
	planId: string;
}) => {
	const testCtx = await liveCtx();
	const product = constructProduct({
		productData: {
			id: planId,
			name: `Live No Stripe ${planId}`,
			group: `group_${planId}`,
			is_add_on: false,
			is_default: false,
			free_trial: null,
			items: [],
		},
		orgId: testCtx.org.id,
		env: testCtx.env,
	});
	await ProductService.insert({ db: testCtx.db, product });

	return ProductService.getFull({
		db: testCtx.db,
		idOrInternalId: product.id,
		orgId: testCtx.org.id,
		env: testCtx.env,
	}) as Promise<FullProduct>;
};

test(`${chalk.yellowBright("live stripe init: carries existing IDs before Live return")}`, async () => {
	const planId = `live_init_reuse_${Math.random().toString(36).slice(2, 9)}`;
	const testCtx = await liveCtx();
	const product = await createLiveProductWithReusablePrice({ planId });

	await initStripeResourcesForProducts({ ctx: testCtx, products: [product] });

	const updated = await ProductService.getFull({
		db: testCtx.db,
		idOrInternalId: planId,
		orgId: testCtx.org.id,
		env: testCtx.env,
	});
	const targetPrice = updated.prices.find(
		(price) => !(price.config as { stripe_price_id?: string }).stripe_price_id,
	) as Price | undefined;
	expect(targetPrice).toBeUndefined();
	expect(
		updated.prices.some(
			(price) =>
				(price.config as { stripe_price_id?: string }).stripe_price_id ===
				`price_${planId}`,
		),
	).toBe(true);
});

test(`${chalk.yellowBright("live stripe init: does not create resources for new Live product")}`, async () => {
	const planId = `live_init_skip_${Math.random().toString(36).slice(2, 9)}`;
	const testCtx = await liveCtx();
	const product = await createLiveProductWithoutStripeResources({ planId });

	await initStripeResourcesForProducts({ ctx: testCtx, products: [product] });

	const updated = await ProductService.getFull({
		db: testCtx.db,
		idOrInternalId: planId,
		orgId: testCtx.org.id,
		env: testCtx.env,
	});
	expect(updated.processor?.id).toBeUndefined();
	expect(updated.prices.length).toBe(0);
});
