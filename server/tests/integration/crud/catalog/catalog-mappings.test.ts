import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ErrCode,
	ProcessorType,
	ProductItemFeatureType,
	ProductItemInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { BillingMethod } from "@autumn/shared/api/products/components/billingMethod.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { createVariantPlan } from "../plans/variants/utils/variantTestPlanUtils.js";
import {
	createCatalogMappingProducts,
	expectDependentStripeFieldsCleared,
	expectDependentStripeFieldsPreset,
	expectFixedStripePriceId,
	expectPlanFamilyBasePriceMapped,
	expectPlanFamilyItemPriceMapped,
	expectPlanFamilyItemPriceUntouched,
	expectPlanFamilyMessagesPricesUntouched,
	expectPriceStripeProduct,
	expectProductsStripeProcessor,
	findBasePrice,
	findItemPriceByFilter,
	findMessagesPrice,
	getPlanFamilyVersions,
	getPlanVersions,
	insertCustomBasePrice,
	setPlanFamilyItemStripePriceProduct,
	setPlanFamilyStripePriceProducts,
} from "./utils/catalogMappingTestUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const pricedMessagesItem = ({
	interval = ProductItemInterval.Month,
}: {
	interval?: ProductItemInterval;
} = {}) => ({
	...items.consumableMessages({ includedUsage: 100, price: 0.25, interval }),
	feature_type: ProductItemFeatureType.SingleUse,
});

const prepaidMessagesItem = () => ({
	...items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
	feature_type: ProductItemFeatureType.SingleUse,
});

const usageMessagesFilter = {
	feature_id: TestFeature.Messages,
	billing_method: BillingMethod.UsageBased,
} as const;

const prepaidMessagesFilter = {
	feature_id: TestFeature.Messages,
	billing_method: BillingMethod.Prepaid,
} as const;

test.concurrent(
	`${chalk.yellowBright("catalog mappings: get omits free entitlement items")}`,
	async () => {
		const customerId = "catalog-mappings-get-omits-free-items";
		const planId = "catalog_mappings_get_omits_free_items";
		const product = products.pro({
			id: planId,
			items: [items.monthlyMessages({ includedUsage: 50_000 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const response = await autumnV2_2.post("/catalog.get_mappings", {
			processor_type: "stripe",
		});
		const planMapping = response.plan_mappings.find(
			(mapping: { plan_id: string }) => mapping.plan_id === planId,
		);

		expect(planMapping).toBeDefined();
		expect(planMapping.item_mappings).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: get item filters are unique across base versions and variants")}`,
	async () => {
		const customerId = "catalog-mappings-get-family-filters";
		const planId = "catalog_mappings_get_family_filters";
		const variantPlanId = `${planId}_annual`;
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await createVariantPlan({
			rpc,
			basePlanId: planId,
			variantPlanId,
			name: "Catalog Mapping Annual Variant",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantPlanId, {
			name: "Catalog Mapping Annual Variant v2",
			force_version: true,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Year },
					price: {
						amount: 0.25,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						interval: BillingInterval.Year,
					},
				},
			],
		});

		const response = await autumnV2_2.post("/catalog.get_mappings", {
			processor_type: "stripe",
		});
		const baseMapping = response.plan_mappings.find(
			(mapping: { plan_id: string }) => mapping.plan_id === planId,
		);
		const usageItemMappings = baseMapping.item_mappings.filter(
			(mapping: {
				filter: {
					feature_id?: string;
					billing_method?: BillingMethod;
					interval?: string;
				};
			}) =>
				mapping.filter.feature_id === TestFeature.Messages &&
				mapping.filter.billing_method === BillingMethod.UsageBased,
		);

		expect(usageItemMappings).toHaveLength(2);
		expect(
			usageItemMappings.map(
				(mapping: { filter: { interval?: string } }) =>
					mapping.filter.interval,
			),
		).toEqual(expect.arrayContaining(["month", "year"]));
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: get marks family item mapping conflict for mixed stripe products")}`,
	async () => {
		const customerId = "catalog-mappings-get-item-conflict";
		const planId = "catalog_mappings_get_item_conflict";
		const variantPlanId = `${planId}_variant`;
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await createVariantPlan({
			rpc,
			basePlanId: planId,
			variantPlanId,
			name: "Catalog Mapping Conflict Variant",
		});
		await setPlanFamilyItemStripePriceProduct({
			ctx,
			basePlanId: planId,
			filter: usageMessagesFilter,
			stripeProductId: "prod_shared_usage",
		});

		const variant = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: variantPlanId,
		});
		const variantUsagePrice = findItemPriceByFilter({
			ctx,
			product: variant,
			filter: usageMessagesFilter,
		});
		expect(variantUsagePrice).toBeDefined();
		await PriceService.update({
			db: ctx.db,
			id: variantUsagePrice!.id,
			update: {
				config: {
					...variantUsagePrice!.config,
					stripe_product_id: "prod_variant_usage",
				},
			},
		});

		const response = await autumnV2_2.post("/catalog.get_mappings", {
			processor_type: "stripe",
		});
		const baseMapping = response.plan_mappings.find(
			(mapping: { plan_id: string }) => mapping.plan_id === planId,
		);
		const usageItemMapping = baseMapping.item_mappings.find(
			(mapping: { filter: { feature_id?: string } }) =>
				mapping.filter.feature_id === TestFeature.Messages,
		);

		expect(usageItemMapping.mapping).toMatchObject({
			stripe_product_id: null,
			stripe_product: null,
			status: "conflict",
		});
	},
);

/**
 * Contract under test:
 *   - POST /catalog.update_mappings with a base plan mapping and
 *     scope="base_price" updates product.processor.id for every version of
 *     the base plan and every version of each variant.
 *   - The same mapping updates only base-price stripe_product_id values.
 *   - Item-level stripe_product_id values and dependent Stripe fields are not
 *     touched unless an item mapping targets them.
 */
test.concurrent(
	`${chalk.yellowBright("catalog mappings: base_price scope maps base family processors and base prices only")}`,
	async () => {
		const customerId = "catalog-mappings-base-family";
		const planId = "catalog_mappings_base_family";
		const variantPlanId = `${planId}_annual`;
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await createVariantPlan({
			rpc,
			basePlanId: planId,
			variantPlanId,
			name: "Catalog Mapping Annual Variant",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			name: "Catalog Mapping Base v2",
			force_version: true,
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantPlanId, {
			name: "Catalog Mapping Variant v2",
			force_version: true,
		});
		await setPlanFamilyStripePriceProducts({
			ctx,
			basePlanId: planId,
			baseStripeProductId: "prod_old_family_base",
			messagesStripeProductId: "prod_old_family_messages",
		});

		const baseVersions = await getPlanVersions({ ctx, planId });
		const familyBefore = await getPlanFamilyVersions({ ctx, basePlanId: planId });
		expect(baseVersions).toHaveLength(2);
		expect(familyBefore.length).toBeGreaterThanOrEqual(4);

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_catalog_family_base",
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const familyAfter = await getPlanFamilyVersions({ ctx, basePlanId: planId });
		expect(familyAfter).toHaveLength(familyBefore.length);
		expectProductsStripeProcessor({
			products: familyAfter,
			stripeProductId: "prod_catalog_family_base",
		});
		await expectPlanFamilyBasePriceMapped({
			ctx,
			basePlanId: planId,
			stripeProductId: "prod_catalog_family_base",
			expectDependentFieldsCleared: true,
		});
		await expectPlanFamilyMessagesPricesUntouched({
			ctx,
			basePlanId: planId,
			stripeProductId: "prod_old_family_messages",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: changed fixed processor resets stale base stripe prices even when price product already matches")}`,
	async () => {
		const customerId = "catalog-mappings-fixed-processor-reset";
		const planId = "catalog_mappings_fixed_processor_reset";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const original = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const originalBasePrice = findBasePrice(original.prices)!;
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: original.internal_id,
			update: {
				processor: {
					id: "prod_old_fixed_processor",
					type: ProcessorType.Stripe,
				},
			},
		});
		await PriceService.update({
			db: ctx.db,
			id: originalBasePrice.id,
			update: {
				config: {
					...originalBasePrice.config,
					stripe_product_id: "prod_new_fixed_processor",
					stripe_price_id: "price_stale_fixed_processor",
					stripe_empty_price_id: "empty_stale_fixed_processor",
				},
			},
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_new_fixed_processor",
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const updated = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const updatedBasePrice = findBasePrice(updated.prices);
		expectProductsStripeProcessor({
			products: [updated],
			stripeProductId: "prod_new_fixed_processor",
		});
		expectPriceStripeProduct({
			price: updatedBasePrice,
			stripeProductId: "prod_new_fixed_processor",
		});
		expectDependentStripeFieldsCleared({ price: updatedBasePrice });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: base_price scope reuses matching Stripe recurring price")}`,
	async () => {
		const planId = "catalog_mappings_base_reuse_stripe_price";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping reuse ${planId}`,
		});
		await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			unit_amount: 2000,
			currency: "usd",
			recurring: { interval: "month", interval_count: 2 },
		});
		const matchingStripePrice = await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			unit_amount: 2000,
			currency: "usd",
			recurring: { interval: "month", interval_count: 1 },
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: stripeProduct.id,
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const updated = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const basePrice = findBasePrice(updated.prices);
		expectProductsStripeProcessor({
			products: [updated],
			stripeProductId: stripeProduct.id,
		});
		expectPriceStripeProduct({
			price: basePrice,
			stripeProductId: stripeProduct.id,
		});
		expectFixedStripePriceId({
			price: basePrice,
			stripePriceId: matchingStripePrice.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: base_price scope ignores matching Stripe price on another product")}`,
	async () => {
		const planId = "catalog_mappings_base_ignore_other_stripe_product";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const targetStripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping target ${planId}`,
		});
		await ctx.stripeCli.prices.create({
			product: targetStripeProduct.id,
			unit_amount: 2100,
			currency: "usd",
			recurring: { interval: "month", interval_count: 1 },
		});
		const otherStripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping other ${planId}`,
		});
		await ctx.stripeCli.prices.create({
			product: otherStripeProduct.id,
			unit_amount: 2000,
			currency: "usd",
			recurring: { interval: "month", interval_count: 1 },
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: targetStripeProduct.id,
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const updated = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const basePrice = findBasePrice(updated.prices);
		expectPriceStripeProduct({
			price: basePrice,
			stripeProductId: targetStripeProduct.id,
		});
		expectFixedStripePriceId({
			price: basePrice,
			stripePriceId: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: custom prices are not reset by catalog mapping updates")}`,
	async () => {
		const customerId = "catalog-mappings-custom-price-ignored";
		const planId = "catalog_mappings_custom_price_ignored";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const original = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const customPrice = await insertCustomBasePrice({
			ctx,
			product: original,
			stripeProductId: "prod_custom_price",
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_catalog_custom_ignored",
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const updatedCustomPrice = await PriceService.get({
			db: ctx.db,
			id: customPrice.id,
		});
		expectPriceStripeProduct({
			price: updatedCustomPrice,
			stripeProductId: "prod_custom_price",
		});
		expectDependentStripeFieldsPreset({
			price: updatedCustomPrice,
			prefix: `custom_${original.internal_id}`,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: nested item mapping targets usage item only across plan family")}`,
	async () => {
		const customerId = "catalog-mappings-nested-items";
		const planId = "catalog_mappings_nested_items";
		const variantPlanId = `${planId}_annual`;
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem(), prepaidMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await createVariantPlan({
			rpc,
			basePlanId: planId,
			variantPlanId,
			name: "Catalog Mapping Nested Item Variant",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			name: "Catalog Mapping Nested Item Base v2",
			force_version: true,
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantPlanId, {
			name: "Catalog Mapping Nested Item Variant v2",
			force_version: true,
		});
		await setPlanFamilyStripePriceProducts({
			ctx,
			basePlanId: planId,
			baseStripeProductId: "prod_old_nested_base",
			messagesStripeProductId: "prod_old_nested_usage",
		});
		await setPlanFamilyItemStripePriceProduct({
			ctx,
			basePlanId: planId,
			filter: usageMessagesFilter,
			stripeProductId: "prod_old_nested_usage",
		});
		await setPlanFamilyItemStripePriceProduct({
			ctx,
			basePlanId: planId,
			filter: prepaidMessagesFilter,
			stripeProductId: "prod_old_nested_prepaid",
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_nested_plan",
					scope: "none",
					item_mappings: [
						{
							filter: usageMessagesFilter,
							stripe_product_id: "prod_nested_usage",
						},
					],
				},
			],
		});

		await expectPlanFamilyBasePriceMapped({
			ctx,
			basePlanId: planId,
			stripeProductId: "prod_old_nested_base",
		});
		await expectPlanFamilyItemPriceMapped({
			ctx,
			basePlanId: planId,
			filter: usageMessagesFilter,
			stripeProductId: "prod_nested_usage",
		});
		await expectPlanFamilyItemPriceUntouched({
			ctx,
			basePlanId: planId,
			filter: prepaidMessagesFilter,
			stripeProductId: "prod_old_nested_prepaid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: unchanged nested item mapping preserves derived stripe price fields")}`,
	async () => {
		const customerId = "catalog-mappings-nested-same-product";
		const planId = "catalog_mappings_nested_same_product";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});
		await setPlanFamilyItemStripePriceProduct({
			ctx,
			basePlanId: planId,
			filter: usageMessagesFilter,
			stripeProductId: "prod_same_nested_usage",
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_same_nested_plan",
					scope: "none",
					item_mappings: [
						{
							filter: usageMessagesFilter,
							stripe_product_id: "prod_same_nested_usage",
						},
					],
				},
			],
		});

		await expectPlanFamilyItemPriceMapped({
			ctx,
			basePlanId: planId,
			filter: usageMessagesFilter,
			stripeProductId: "prod_same_nested_usage",
			expectDependentFieldsCleared: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: nested item mapping with no matching price returns 400")}`,
	async () => {
		const customerId = "catalog-mappings-nested-no-match";
		const planId = "catalog_mappings_nested_no_match";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/catalog.update_mappings", {
					processor_type: "stripe",
					plan_mappings: [
						{
							plan_id: planId,
							stripe_product_id: "prod_nested_plan_no_match",
							scope: "none",
							item_mappings: [
								{
									filter: {
										feature_id: TestFeature.Messages,
										billing_method: "prepaid",
									},
									stripe_product_id: "prod_should_not_apply",
								},
							],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: update maps product/base price and nested item price")}`,
	async () => {
		const customerId = "catalog-mappings-basic-customer";
		const planId = "catalog_mappings_basic";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		await setPlanFamilyStripePriceProducts({
			ctx,
			basePlanId: planId,
			baseStripeProductId: "prod_old_base",
			messagesStripeProductId: "prod_old_messages",
		});

		const response = await autumnV2_2.post("/catalog.update_mappings", {
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_catalog_plan",
					item_mappings: [
						{
							filter: usageMessagesFilter,
							stripe_product_id: "prod_catalog_messages",
						},
					],
				},
			],
		});

		const mappedPlan = response.plan_mappings.find(
			(mapping: { plan_id: string }) => mapping.plan_id === planId,
		);
		const mappedItem = mappedPlan.item_mappings.find(
			(mapping: { filter: { feature_id?: string } }) =>
				mapping.filter.feature_id === TestFeature.Messages,
		);
		expect(response.item_mappings).toBeUndefined();
		expect(mappedPlan.mapping.stripe_product_id).toBe("prod_catalog_plan");
		expect(mappedItem.mapping.stripe_product_id).toBe("prod_catalog_messages");

		const updated = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		expectProductsStripeProcessor({
			products: [updated],
			stripeProductId: "prod_catalog_plan",
		});

		const basePrice = findBasePrice(updated.prices);
		const messagesPrice = findMessagesPrice(updated.prices);
		expectPriceStripeProduct({
			price: basePrice,
			stripeProductId: "prod_catalog_plan",
		});
		expectPriceStripeProduct({
			price: messagesPrice,
			stripeProductId: "prod_catalog_messages",
		});
		expectDependentStripeFieldsCleared({ price: basePrice });
		expectDependentStripeFieldsCleared({ price: messagesPrice });
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog mappings: update applies to every version of a plan")}`,
	async () => {
		const customerId = "catalog-mappings-versions-customer";
		const planId = "catalog_mappings_versions";
		const product = products.pro({
			id: planId,
			items: [pricedMessagesItem()],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: planId,
					name: product.name,
					force_version: true,
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: "month" },
							price: {
								amount: 0.5,
								billing_units: 1,
								billing_method: "usage_based",
								interval: "month",
							},
						},
					],
				},
			],
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_all_versions",
					scope: "base_price",
					item_mappings: [
						{
							filter: usageMessagesFilter,
							stripe_product_id: "prod_messages_all_versions",
						},
					],
				},
			],
		});

		const versions = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [planId],
			returnAll: true,
		});

		expect(versions.length).toBe(2);
		expectProductsStripeProcessor({
			products: versions,
			stripeProductId: "prod_all_versions",
		});
		for (const version of versions) {
			expectPriceStripeProduct({
				price: findBasePrice(version.prices),
				stripeProductId: "prod_all_versions",
			});
			expectPriceStripeProduct({
				price: findMessagesPrice(version.prices),
				stripeProductId: "prod_messages_all_versions",
			});
		}
	},
);
