import { expect } from "bun:test";
import {
	FeatureType,
	ApiVersion,
	BillingInterval,
	FixedPriceConfigSchema,
	isFixedPrice,
	ProcessorType,
	PriceType,
	PriceSchema,
	UsagePriceConfigSchema,
	type FullProduct,
	type PlanItemFilter,
	type Price,
	type ProductV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { createProducts } from "@tests/utils/productUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { buildProductMappingContext } from "@/internal/catalog/actions/catalogMappings/catalogMappingUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { matchesPlanItemFilter } from "@utils/productV2Utils/productItemUtils/matchPlanItem.js";

export type CatalogMappingTestContext = {
	db: unknown;
	env: unknown;
	org: { id: string };
	orgSecretKey?: string;
};

export const ensureMessagesFeature = async ({
	autumn,
}: {
	autumn: Pick<AutumnInt, "post">;
}) => {
	try {
		await autumn.post("/features.create", {
			feature_id: TestFeature.Messages,
			name: TestFeature.Messages,
			type: FeatureType.Metered,
			consumable: true,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("already exists")
		) {
			return;
		}
		throw error;
	}
};

export const createCatalogMappingProducts = async ({
	ctx,
	autumn,
	products,
}: {
	ctx: CatalogMappingTestContext;
	autumn: AutumnInt;
	products: ProductV2[];
}) => {
	await ensureMessagesFeature({ autumn });
	const createProductsClient = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey ?? "",
	});
	await createProducts({
		db: ctx.db as never,
		orgId: ctx.org.id,
		env: ctx.env as never,
		autumn: createProductsClient,
		products,
		createInStripe: false,
	});
};

export const findBasePrice = (prices: Price[]) =>
	prices.find((price) => !price.config.feature_id);

export const findMessagesPrice = (prices: Price[]) =>
	prices.find((price) => price.config.feature_id === TestFeature.Messages);

const getItemPriceEntries = ({
	ctx,
	product,
}: {
	ctx: CatalogMappingTestContext & { features?: unknown };
	product: FullProduct;
}) =>
	buildProductMappingContext({
		product,
		features: (ctx.features ?? []) as never,
		currency: "usd",
	}).itemPrices;

export const findItemPriceByFilter = ({
	ctx,
	product,
	filter,
}: {
	ctx: CatalogMappingTestContext & { features?: unknown };
	product: FullProduct;
	filter: PlanItemFilter;
}) =>
	getItemPriceEntries({ ctx, product }).find((entry) =>
		matchesPlanItemFilter({ item: entry.item, filter }),
	)?.price;

export const expectPriceStripeProduct = ({
	price,
	stripeProductId,
}: {
	price: Price | undefined;
	stripeProductId: string | null;
}) => {
	expect(price).toBeDefined();
	PriceSchema.parse(price);
	expect(price!.config.stripe_product_id ?? null).toBe(stripeProductId);
};

export const expectFixedStripePriceId = ({
	price,
	stripePriceId,
}: {
	price: Price | undefined;
	stripePriceId: string | null;
}) => {
	expect(price).toBeDefined();
	PriceSchema.parse(price);
	if (!isFixedPrice(price!)) {
		throw new Error(`Expected fixed price ${price!.id}`);
	}
	const config = FixedPriceConfigSchema.parse(price!.config);
	expect(config.stripe_price_id ?? null).toBe(stripePriceId);
};

const getFixedStripeConfig = ({
	price,
	stripeProductId,
	prefix,
}: {
	price: Price;
	stripeProductId: string;
	prefix: string;
}): Price["config"] => {
	if (!isFixedPrice(price)) {
		throw new Error(`Expected fixed price ${price.id}`);
	}
	const config = FixedPriceConfigSchema.parse(price.config);

	return {
		...config,
		stripe_product_id: stripeProductId,
		stripe_price_id: `price_${prefix}`,
		stripe_empty_price_id: `empty_${prefix}`,
	};
};

const getUsageStripeConfig = ({
	price,
	stripeProductId,
	prefix,
}: {
	price: Price;
	stripeProductId: string;
	prefix: string;
}): Price["config"] => {
	if (isFixedPrice(price)) {
		throw new Error(`Expected usage price ${price.id}`);
	}
	const config = UsagePriceConfigSchema.parse(price.config);

	return {
		...config,
		stripe_product_id: stripeProductId,
		stripe_price_id: `price_${prefix}`,
		stripe_empty_price_id: `empty_${prefix}`,
		stripe_placeholder_price_id: `placeholder_${prefix}`,
		stripe_prepaid_price_v2_id: `prepaid_${prefix}`,
		stripe_meter_id: `meter_${prefix}`,
		stripe_event_name: `event_${prefix}`,
	};
};

export const expectDependentStripeFieldsCleared = ({
	price,
}: {
	price: Price | undefined;
}) => {
	expect(price).toBeDefined();
	PriceSchema.parse(price);

	if (isFixedPrice(price!)) {
		const config = FixedPriceConfigSchema.parse(price!.config);
		expect(config.stripe_price_id).toBeNull();
		expect(config.stripe_empty_price_id).toBeNull();
		return;
	}

	const config = UsagePriceConfigSchema.parse(price!.config);
	expect(config.stripe_price_id).toBeNull();
	expect(config.stripe_empty_price_id).toBeNull();
	expect(config.stripe_placeholder_price_id).toBeNull();
	expect(config.stripe_prepaid_price_v2_id).toBeNull();
	expect(config.stripe_meter_id).toBeNull();
	expect(config.stripe_event_name).toBeNull();
};

export const expectDependentStripeFieldsPreset = ({
	price,
	prefix,
}: {
	price: Price | undefined;
	prefix: string;
}) => {
	expect(price).toBeDefined();
	PriceSchema.parse(price);

	if (isFixedPrice(price!)) {
		const config = FixedPriceConfigSchema.parse(price!.config);
		expect(config.stripe_price_id).toBe(`price_${prefix}`);
		expect(config.stripe_empty_price_id).toBe(`empty_${prefix}`);
		return;
	}

	const config = UsagePriceConfigSchema.parse(price!.config);
	expect(config.stripe_price_id).toBe(`price_${prefix}`);
	expect(config.stripe_empty_price_id).toBe(`empty_${prefix}`);
	expect(config.stripe_placeholder_price_id).toBe(`placeholder_${prefix}`);
	expect(config.stripe_prepaid_price_v2_id).toBe(`prepaid_${prefix}`);
	expect(config.stripe_meter_id).toBe(`meter_${prefix}`);
	expect(config.stripe_event_name).toBe(`event_${prefix}`);
};

export const getPlanVersions = ({
	ctx,
	planId,
}: {
	ctx: CatalogMappingTestContext;
	planId: string;
}) =>
	ProductService.listFull({
		db: ctx.db as never,
		orgId: ctx.org.id,
		env: ctx.env as never,
		inIds: [planId],
		returnAll: true,
	});

export const getPlanFamilyVersions = async ({
	ctx,
	basePlanId,
}: {
	ctx: CatalogMappingTestContext;
	basePlanId: string;
}) => {
	const baseVersions = await getPlanVersions({ ctx, planId: basePlanId });
	const variantVersions = await ProductService.listVariantsByParent({
		db: ctx.db as never,
		orgId: ctx.org.id,
		env: ctx.env as never,
		baseInternalProductIds: baseVersions.map((product) => product.internal_id),
		returnAll: true,
	});

	return [...baseVersions, ...variantVersions];
};

export const setPlanFamilyStripePriceProducts = async ({
	ctx,
	basePlanId,
	baseStripeProductId,
	messagesStripeProductId,
}: {
	ctx: CatalogMappingTestContext;
	basePlanId: string;
	baseStripeProductId: string;
	messagesStripeProductId: string;
}) => {
	const products = await getPlanFamilyVersions({ ctx, basePlanId });

	for (const product of products) {
		const basePrice = findBasePrice(product.prices);
		if (basePrice) {
			await PriceService.update({
				db: ctx.db as never,
				id: basePrice.id,
				update: {
					config: getFixedStripeConfig({
						price: basePrice,
						stripeProductId: baseStripeProductId,
						prefix: `old_base_${product.internal_id}`,
					}),
				},
			});
		}

		const messagesPrice = findMessagesPrice(product.prices);
		if (messagesPrice) {
			await PriceService.update({
				db: ctx.db as never,
				id: messagesPrice.id,
				update: {
					config: getUsageStripeConfig({
						price: messagesPrice,
						stripeProductId: messagesStripeProductId,
						prefix: `old_messages_${product.internal_id}`,
					}),
				},
			});
		}
	}
};

export const setPlanFamilyItemStripePriceProduct = async ({
	ctx,
	basePlanId,
	filter,
	stripeProductId,
}: {
	ctx: CatalogMappingTestContext & { features?: unknown };
	basePlanId: string;
	filter: PlanItemFilter;
	stripeProductId: string;
}) => {
	const products = await getPlanFamilyVersions({ ctx, basePlanId });

	for (const product of products) {
		const price = findItemPriceByFilter({ ctx, product, filter });
		if (!price) continue;

		await PriceService.update({
			db: ctx.db as never,
			id: price.id,
			update: {
				config: getUsageStripeConfig({
					price,
					stripeProductId,
					prefix: `old_item_${product.internal_id}_${price.id}`,
				}),
			},
		});
	}
};

export const expectProductsStripeProcessor = ({
	products,
	stripeProductId,
}: {
	products: FullProduct[];
	stripeProductId: string;
}) => {
	for (const product of products) {
		expect(product.processor).toEqual({
			id: stripeProductId,
			type: ProcessorType.Stripe,
		});
	}
};

export const expectPlanFamilyBasePriceMapped = async ({
	ctx,
	basePlanId,
	stripeProductId,
	expectDependentFieldsCleared = false,
}: {
	ctx: CatalogMappingTestContext;
	basePlanId: string;
	stripeProductId: string;
	expectDependentFieldsCleared?: boolean;
}) => {
	const products = await getPlanFamilyVersions({ ctx, basePlanId });

	for (const product of products) {
		const price = findBasePrice(product.prices);
		expectPriceStripeProduct({ price, stripeProductId });
		if (expectDependentFieldsCleared) {
			expectDependentStripeFieldsCleared({ price });
		}
	}
};

export const expectPlanFamilyMessagesPricesUntouched = async ({
	ctx,
	basePlanId,
	stripeProductId,
}: {
	ctx: CatalogMappingTestContext;
	basePlanId: string;
	stripeProductId: string;
}) => {
	const products = await getPlanFamilyVersions({ ctx, basePlanId });

	for (const product of products) {
		const messagesPrice = findMessagesPrice(product.prices);
		expectPriceStripeProduct({ price: messagesPrice, stripeProductId });
		expectDependentStripeFieldsPreset({
			price: messagesPrice,
			prefix: `old_messages_${product.internal_id}`,
		});
	}
};

export const expectPlanFamilyItemPriceMapped = async ({
	ctx,
	basePlanId,
	filter,
	stripeProductId,
	expectDependentFieldsCleared = true,
}: {
	ctx: CatalogMappingTestContext & { features?: unknown };
	basePlanId: string;
	filter: PlanItemFilter;
	stripeProductId: string;
	expectDependentFieldsCleared?: boolean;
}) => {
	const products = await getPlanFamilyVersions({ ctx, basePlanId });

	for (const product of products) {
		const price = findItemPriceByFilter({ ctx, product, filter });
		expectPriceStripeProduct({ price, stripeProductId });

		if (!price) continue;
		if (expectDependentFieldsCleared) {
			expectDependentStripeFieldsCleared({ price });
		} else {
			expectDependentStripeFieldsPreset({
				price,
				prefix: `old_item_${product.internal_id}_${price.id}`,
			});
		}
	}
};

export const expectPlanFamilyItemPriceUntouched = async ({
	ctx,
	basePlanId,
	filter,
	stripeProductId,
}: {
	ctx: CatalogMappingTestContext & { features?: unknown };
	basePlanId: string;
	filter: PlanItemFilter;
	stripeProductId: string;
}) =>
	expectPlanFamilyItemPriceMapped({
		ctx,
		basePlanId,
		filter,
		stripeProductId,
		expectDependentFieldsCleared: false,
	});

export const insertCustomBasePrice = async ({
	ctx,
	product,
	stripeProductId,
}: {
	ctx: CatalogMappingTestContext;
	product: FullProduct;
	stripeProductId: string;
}) => {
	const customPrice: Price = {
		id: `custom_price_${product.internal_id}`,
		org_id: ctx.org.id,
		internal_product_id: product.internal_id,
		config: {
			type: PriceType.Fixed,
			amount: 99,
			interval: BillingInterval.Month,
			interval_count: 1,
			stripe_product_id: stripeProductId,
			stripe_price_id: `price_custom_${product.internal_id}`,
			stripe_empty_price_id: `empty_custom_${product.internal_id}`,
			feature_id: null,
			internal_feature_id: null,
		},
		created_at: Date.now(),
		billing_type: null,
		tier_behavior: null,
		is_custom: true,
		entitlement_id: null,
		proration_config: null,
	};

	await PriceService.insert({ db: ctx.db as never, data: customPrice });
	return customPrice;
};
