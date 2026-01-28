import {
	type AppEnv,
	BillingInterval,
	BillingType,
	type CreateProductV2Params,
	EntInterval,
	type Entitlement,
	EntitlementSchema,
	ErrCode,
	type Feature,
	type FixedPriceConfig,
	type FullProduct,
	intervalsSame,
	nullish,
	type Organization,
	type Price,
	PriceSchema,
	PriceType,
	ProcessorType,
	type Product,
	ProductSchema,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { createStripeCli } from "@server/external/connect/createStripeCli.js";
import { createStripePriceIFNotExist } from "@server/external/stripe/createStripePrice/createStripePrice.js";
import {
	getBillingInterval,
	getBillingType,
} from "@server/internal/products/prices/priceUtils.js";
import RecaseError from "@server/utils/errorUtils.js";
import { generateId, notNullish } from "@server/utils/genUtils.js";
import { Decimal } from "decimal.js";
import { Stripe } from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type {
	AttachParams,
	InsertCusProductParams,
} from "../customers/cusProducts/AttachParams.js";
import { isStripeConnected } from "../orgs/orgUtils.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import { getEntitlementsForProduct } from "./entitlements/entitlementUtils.js";
import { FreeTrialService } from "./free-trials/FreeTrialService.js";
import { ProductService } from "./ProductService.js";
import { PriceService } from "./prices/PriceService.js";
import { compareBillingIntervals } from "./prices/priceUtils/priceIntervalUtils.js";
import { isDefaultTrialFullProduct } from "./productUtils/classifyProduct.js";

export const getLatestProducts = (products: FullProduct[]) => {
	const latestProducts = products.reduce((acc: any, product: any) => {
		if (!acc[product.id]) {
			acc[product.id] = product;
		} else if (product.version > acc[product.id].version) {
			acc[product.id] = product;
		}
		return acc;
	}, {});

	return Object.values(latestProducts) as FullProduct[];
};

const getProductVersionCounts = (products: FullProduct[]) => {
	const versionCounts = products.reduce((acc: any, product: any) => {
		if (!acc[product.id]) {
			acc[product.id] = 1;
		} else {
			acc[product.id]++;
		}
		return acc;
	}, {});

	return versionCounts;
};

// Construct product
export const constructProduct = ({
	productData,
	version = 1,
	orgId,
	env,
	processor,
}: {
	productData: CreateProductV2Params;
	version?: number;
	orgId: string;
	env: AppEnv;
	processor?: {
		id: string;
		type: string;
	};
}) => {
	const newProduct: Product = {
		id: productData.id,
		name: productData.name,
		description: productData.description ?? null,
		is_add_on: productData.is_add_on,
		is_default: productData.is_default,
		version: version,
		group: productData.group || "",

		env,
		internal_id: generateId("prod"),
		org_id: orgId,
		created_at: Date.now(),
		processor,
		base_variant_id: null,
		archived: false,
	};

	return newProduct;
};

export const isProductUpgrade = ({
	prices1,
	prices2,
	usageAlwaysUpgrade = true,
}: {
	prices1: Price[];
	prices2: Price[];
	usageAlwaysUpgrade?: boolean;
}) => {
	if (isFreeProduct(prices1) && !isFreeProduct(prices2)) {
		return true;
	}

	if (!isFreeProduct(prices1) && isFreeProduct(prices2)) {
		return false;
	}

	if (
		prices1.every(
			(p) => getBillingType(p.config!) === BillingType.UsageInArrear,
		) &&
		prices2.every(
			(p) => getBillingType(p.config!) === BillingType.UsageInArrear,
		) &&
		usageAlwaysUpgrade
	) {
		return true;
	}

	const billingInterval1 = getBillingInterval(prices1); // pro quarter
	const billingInterval2 = getBillingInterval(prices2); // premium

	// 2. Get total price for each product
	const getTotalPrice = (prices: Price[]) => {
		let totalPrice = new Decimal(0);
		for (const price of prices) {
			if ("usage_tiers" in price.config!) {
				const tiers = price.config!.usage_tiers;
				if (nullish(tiers) || tiers.length === 0) continue;
				totalPrice = totalPrice.plus(tiers[0].amount);
			} else {
				totalPrice = totalPrice.plus(price.config!.amount);
			}
		}
		return totalPrice.toNumber();
	};

	// 3. Compare prices

	if (
		intervalsSame({
			intervalA: billingInterval1,
			intervalB: billingInterval2,
		})
	) {
		return getTotalPrice(prices1) < getTotalPrice(prices2);
	} else {
		return (
			compareBillingIntervals({
				configA: billingInterval1,
				configB: billingInterval2,
			}) > 0
		);
	}
};

export const isFreeProduct = (prices: Price[]) => {
	if (prices.length === 0) {
		return true;
	}

	let totalPrice = 0;
	for (const price of prices) {
		if ("usage_tiers" in price.config!) {
			const tiers = price.config!.usage_tiers;
			if (nullish(tiers) || tiers.length === 0) continue;
			totalPrice += tiers.reduce((acc, tier) => acc + tier.amount, 0);
		} else {
			totalPrice += price.config!.amount;
		}
	}
	return totalPrice === 0;
};

const getOptionsFromPrices = (prices: Price[], features: Feature[]) => {
	const featureToOptions: { [key: string]: any } = {};
	for (const price of prices) {
		if (price.config!.type === PriceType.Fixed) {
			continue;
		}

		const config = price.config! as UsagePriceConfig;
		// get billing tyoe
		const billingType = getBillingType(price.config!);
		const feature = features.find(
			(f) => f.internal_id === config.internal_feature_id,
		);

		if (!feature) {
			continue;
		}

		if (billingType === BillingType.UsageInAdvance) {
			if (!featureToOptions[feature.id]) {
				featureToOptions[feature.id] = {
					feature_id: feature.id,
					feature_name: feature.name,
					quantity: 0,
				};
			}

			featureToOptions[feature.id].quantity = 0;
		}
	}

	return Object.values(featureToOptions);
};

export const checkStripeProductExists = async ({
	db,
	org,
	env,
	product,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	product: FullProduct;
	logger: any;
}) => {
	let createNew = false;
	const stripeCli = createStripeCli({
		org,
		env,
	});

	if (!product.processor || !product.processor.id) {
		createNew = true;
	} else {
		try {
			const stripeProduct = await stripeCli.products.retrieve(
				product.processor!.id,
			);

			if (!stripeProduct.active) {
				await stripeCli.products.update(product.processor!.id, {
					active: true,
				});
			}
		} catch (error) {
			if (
				error instanceof Stripe.errors.StripeError &&
				error.code?.includes("resource_missing")
			) {
				createNew = true;
			} else {
				throw error;
			}
		}
	}

	if (createNew) {
		logger.info(`Creating new product in Stripe for ${product.name}`);
		const stripeProduct = await stripeCli.products.create({
			name: product.name,
		});

		await ProductService.updateByInternalId({
			db,
			internalId: product.internal_id,
			update: {
				processor: { id: stripeProduct.id, type: ProcessorType.Stripe },
			},
		});

		product.processor = {
			id: stripeProduct.id,
			type: ProcessorType.Stripe,
		};
	}
};

const getPricesForProduct = (product: FullProduct, prices: Price[]) => {
	return prices.filter((p) => p.internal_product_id === product.internal_id);
};

export const attachToInsertParams = (
	attachParams: AttachParams,
	product: FullProduct,
	entityId?: string,
) => {
	// Get entity
	let { internalEntityId, entityId: attachEntityId } = attachParams;
	if (notNullish(entityId)) {
		const entity = attachParams.customer.entities.find(
			(e) => e.id === entityId,
		);

		if (entity) {
			internalEntityId = entity.internal_id;
			attachEntityId = entity.id;
		}
	}

	return {
		...attachParams,
		product,
		prices: getPricesForProduct(product, attachParams.prices),
		entitlements: getEntitlementsForProduct(product, attachParams.entitlements),
		entityId: attachEntityId,
		internalEntityId: internalEntityId,
	} as InsertCusProductParams;
};

// COPY PRODUCT
export const copyProduct = async ({
	db,
	product,
	toOrgId,
	toId,
	toName,
	fromEnv,
	toEnv,
	toFeatures,
	fromFeatures,
	org,
	logger,
}: {
	db: DrizzleCli;
	product: FullProduct;
	toOrgId: string;
	fromEnv: AppEnv;
	toEnv: AppEnv;
	toId: string;
	toName: string;
	toFeatures: Feature[];
	fromFeatures: Feature[];
	org: Organization;
	logger: any;
}) => {
	const newProduct = {
		...product,
		name: toName,
		id: toId,
		internal_id: generateId("prod"),
		org_id: toOrgId,
		env: toEnv,
		processor: null,
		base_variant_id: fromEnv === toEnv ? null : product.base_variant_id,
	};

	const newEntitlements: Entitlement[] = [];
	const newEntIds: Record<string, string> = {};

	for (const entitlement of product.entitlements) {
		// 1. Get from feature
		const fromFeature = fromFeatures.find(
			(f) => f.internal_id === entitlement.internal_feature_id,
		);

		// 2. Get to feature
		const toFeature = toFeatures.find((f) => f.id === fromFeature?.id);

		if (!toFeature) {
			throw new RecaseError({
				message: `Feature ${entitlement.feature_id} not found`,
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		const newId = generateId("ent");
		newEntitlements.push(
			EntitlementSchema.parse({
				...entitlement,
				interval_count: entitlement.interval_count ?? 1,
				id: newId,
				org_id: toOrgId,
				created_at: Date.now(),
				internal_product_id: newProduct.internal_id,
				internal_feature_id: toFeature.internal_id,
			}),
		);

		newEntIds[entitlement.id!] = newId;
	}

	const newPrices: Price[] = [];
	for (const price of product.prices) {
		// 1. Copy price
		const newPrice = structuredClone(price);

		const config = newPrice.config as UsagePriceConfig;

		// Clear Stripe IDs
		config.stripe_meter_id = undefined;
		config.stripe_product_id = undefined;
		config.stripe_placeholder_price_id = undefined;
		config.stripe_price_id = undefined;

		if (config.type === PriceType.Usage) {
			const fromFeature = fromFeatures.find(
				(f) => f.internal_id === config.internal_feature_id,
			);

			const toFeature = toFeatures.find((f) => f.id === fromFeature?.id);

			if (!toFeature) {
				throw new RecaseError({
					message: `Feature ${config.feature_id} not found`,
					code: ErrCode.FeatureNotFound,
					statusCode: 404,
				});
			}

			config.internal_feature_id = toFeature.internal_id!;
			config.feature_id = toFeature.id;

			// Update entitlement id
			const entitlementId = newEntIds[price.entitlement_id!];
			if (!entitlementId) {
				throw new RecaseError({
					message: `Failed to swap entitlement id for price ${price.id}`,
					code: ErrCode.InternalError,
					statusCode: 500,
				});
			}
			newPrice.entitlement_id = entitlementId;
		}

		newPrices.push(
			PriceSchema.parse({
				...newPrice,
				id: generateId("pr"),
				created_at: Date.now(),
				org_id: toOrgId,
				internal_product_id: newProduct.internal_id,
				config: config,
			}),
		);
	}

	await ProductService.insert({
		db,
		product: {
			...ProductSchema.parse(newProduct),
			// group: newProduct.group || "",
			version: 1,
		},
	});

	await EntitlementService.insert({
		db,
		data: newEntitlements,
	});

	await PriceService.insert({
		db,
		data: newPrices,
	});

	if (product.free_trial) {
		await FreeTrialService.insert({
			db,
			data: {
				...product.free_trial,
				id: generateId("ft"),
				created_at: Date.now(),
				internal_product_id: newProduct.internal_id,
			},
		});
	}

	// await initProductInStripe({
	//   db,
	//   org,
	//   env: toEnv,
	//   logger,
	//   product: {
	//     ...newProduct,
	//     prices: newPrices,
	//     entitlements: getEntsWithFeature({
	//       ents: newEntitlements,
	//       features: toFeatures,
	//     }),
	//   },
	// });
};

export const isOneOff = (prices: Price[]) => {
	return (
		prices.every((p) => p.config?.interval === BillingInterval.OneOff) &&
		prices.some((p) => {
			if (p.config?.type === PriceType.Usage) {
				const config = p.config as UsagePriceConfig;
				return config.usage_tiers.some((t) => t.amount > 0);
			} else {
				const config = p.config as FixedPriceConfig;
				return config.amount > 0;
			}
		})
	);
};

const itemsAreOneOff = (items: Entitlement[]) => {
	return items.every(
		(item) =>
			item.interval === null ||
			item.interval === undefined ||
			item.interval === EntInterval.Lifetime,
	);
};

export const initProductInStripe = async ({
	db,
	org,
	env,
	logger,
	product,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
	product: FullProduct;
}): Promise<undefined> => {
	if (!isStripeConnected({ org, env })) return;

	await checkStripeProductExists({
		db,
		org,
		env,
		product,
		logger,
	});

	const batchPriceUpdate = [];
	const stripeCli = createStripeCli({
		org,
		env,
	});
	for (const price of product.prices) {
		batchPriceUpdate.push(
			createStripePriceIFNotExist({
				db,
				org,
				stripeCli,
				price,
				entitlements: product.entitlements,
				product: product,
				logger,
			}),
		);
	}

	await Promise.all(batchPriceUpdate);
};

const searchProductsByStripeId = async ({
	products,
	stripeId,
}: {
	products: FullProduct[];
	stripeId: string;
}) => {
	return products.find((p) => p.processor?.id === stripeId);
};

export const getGroupToDefaults = ({
	defaultProds,
}: {
	defaultProds: FullProduct[];
}) => {
	const groupToDefaults: Record<string, Record<string, FullProduct>> = {};

	for (const product of defaultProds) {
		if (product.archived || !product.is_default) continue;
		if (!groupToDefaults[product.group]) {
			groupToDefaults[product.group] = {};
		}

		if (isDefaultTrialFullProduct({ product })) {
			groupToDefaults[product.group].defaultTrial = product;
		}

		if (isFreeProduct(product.prices)) {
			groupToDefaults[product.group].free = product;
		}
	}

	return groupToDefaults;
};
