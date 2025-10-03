import {
	type AppEnv,
	BillingType,
	CusProductStatus,
	type Customer,
	type CustomerData,
	type Entitlement,
	type EntitlementWithFeature,
	type EntityData,
	ErrCode,
	type Feature,
	type FeatureOptions,
	type FreeTrial,
	type FullCusProduct,
	type Organization,
	type Price,
	type ProductItem,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import {
	getFreeTrialAfterFingerprint,
	handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getPricesForCusProduct } from "../change-product/scheduleUtils.js";
import { getExistingCusProducts } from "./cusProductUtils/getExistingCusProducts.js";

const getProducts = async ({
	db,
	productId,
	productIds,
	orgId,
	env,
	version,
}: {
	db: DrizzleCli;
	productId?: string;
	productIds?: string[];
	orgId: string;
	env: AppEnv;
	version?: number;
}) => {
	if (productId && productIds) {
		throw new RecaseError({
			message: `Only one of product_id or product_ids can be provided`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (productId) {
		const product = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId,
			env,
			version,
		});

		return [product];
	}

	if (productIds) {
		if (notNullish(version)) {
			throw new RecaseError({
				message: "Cannot provide version when providing product ids",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Check for duplicates in productIds
		const uniqueProductIds = new Set(productIds);
		if (uniqueProductIds.size !== productIds.length) {
			throw new RecaseError({
				message: "Not allowed duplicate product ids",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const products = await ProductService.listFull({
			db,
			orgId,
			env,
			inIds: productIds,
		});

		if (products.length === 0) {
			throw new RecaseError({
				message: "No products found",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (products.length !== productIds.length) {
			// Get product ids that were not found
			throw new RecaseError({
				message:
					"Number of products found does not match number of product ids",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Check if more than one product has a free trial
		const productsWithFreeTrial = products.filter((p) => p.free_trial !== null);
		if (productsWithFreeTrial.length > 1) {
			throw new RecaseError({
				message: "Cannot attach multiple products with free trials",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Check that there aren't two products in the same group that are both not add-ons
		for (const product of products) {
			if (product.group && !product.is_add_on) {
				// Find another product in the same group that is not an add-on
				const otherProduct = products.find(
					(p) =>
						p.group === product.group && !p.is_add_on && p.id !== product.id,
				);
				if (otherProduct) {
					throw new RecaseError({
						message: `Cannot attach two main products from the same group ${product.group}`,
						code: ErrCode.InvalidRequest,
						statusCode: StatusCodes.BAD_REQUEST,
					});
				}
			}
		}

		return products;
	}

	return [];
};

const getCustomerAndProducts = async ({
	req,
	db,
	org,
	features,
	customerId,
	customerData,
	productId,
	productIds,

	env,
	logger,
	version,
	entityId,
	entityData,
}: {
	req: ExtendedRequest;
	db: DrizzleCli;
	org: Organization;
	features: Feature[];
	customerData?: CustomerData;
	customerId: string;
	productId?: string;
	productIds?: string[];
	env: AppEnv;
	logger: any;
	version?: number;
	entityId?: string;
	entityData?: EntityData;
}) => {
	const [customer, products] = await Promise.all([
		getOrCreateCustomer({
			req,
			customerId,
			customerData,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.Scheduled,
				CusProductStatus.PastDue,
			],
			withEntities: true,
			entityId,
			entityData,
		}),
		getProducts({
			db,
			productId,
			productIds,
			orgId: org.id,
			env,
			version,
		}),
	]);

	const cusProducts = customer.customer_products;

	return { customer, cusProducts, products };
};

const getEntsWithFeature = (ents: Entitlement[], features: Feature[]) => {
	return ents.map((ent) => ({
		...ent,
		feature: features.find(
			(f) => f.internal_id === ent.internal_feature_id,
		) as Feature,
	}));
};

const mapOptionsList = ({
	optionsListInput,
	features,
	prices,
}: {
	optionsListInput: FeatureOptions[];
	features: Feature[];
	prices: Price[];
}) => {
	const newOptionsList: FeatureOptions[] = [];
	for (const options of optionsListInput) {
		const feature = features.find(
			(feature) => feature.id === options.feature_id,
		);

		if (!feature) {
			throw new RecaseError({
				message: `Feature ${options.feature_id} not found`,
				code: ErrCode.FeatureNotFound,
				statusCode: 400,
			});
		}

		let quantity = options?.quantity;
		if (!nullish(quantity)) {
			const prepaidPrice = prices.find(
				(p) =>
					getBillingType(p.config!) === BillingType.UsageInAdvance &&
					feature.internal_id ===
						(p.config as UsagePriceConfig).internal_feature_id,
			);

			if (!prepaidPrice) {
				throw new RecaseError({
					message: `No prepaid price found for feature ${feature.id}`,
					code: ErrCode.FeatureNotFound,
					statusCode: 400,
				});
			}

			const config = prepaidPrice.config as UsagePriceConfig;

			const dividedQuantity = new Decimal(options.quantity!)
				.div(config.billing_units || 1)
				.ceil()
				.toNumber();

			quantity = dividedQuantity;
		}

		newOptionsList.push({
			...options,
			internal_feature_id: feature.internal_id,
			quantity,
		});
	}

	return newOptionsList;
};

export const getFullCusProductData = async ({
	req,
	db,
	org,
	features,
	customerId,
	customerData,
	productId,
	entityId,
	productIds,
	itemsInput,
	env,
	optionsListInput,
	freeTrialInput,
	isCustom = false,
	logger,
	version,
	entityData,
}: {
	req: ExtendedRequest;
	db: DrizzleCli;
	org: Organization;
	features: Feature[];
	customerId: string;
	customerData?: Customer;
	productId?: string;
	productIds?: string[];
	itemsInput: ProductItem[];
	env: AppEnv;
	optionsListInput: FeatureOptions[];
	freeTrialInput: FreeTrial | null;
	isCustom?: boolean;
	logger: any;
	version?: number;
	entityId?: string;
	entityData?: EntityData;
}) => {
	// 1. Get customer, product, org & features
	const { customer, products, cusProducts } = await getCustomerAndProducts({
		req,
		db,
		org,
		features,
		customerId,
		customerData,
		productId,
		productIds,
		env,
		logger,
		version,

		entityId,
		entityData,
	});

	if (!isCustom) {
		let freeTrial = null;
		const freeTrialProduct = products.find((p) => notNullish(p.free_trial));

		if (freeTrialProduct) {
			freeTrial = await getFreeTrialAfterFingerprint({
				db,
				freeTrial: freeTrialProduct.free_trial,
				productId: freeTrialProduct.id,
				fingerprint: customer.fingerprint,
				internalCustomerId: customer.internal_id,
				multipleAllowed: org.config.multiple_trials,
			});
		}

		return {
			customer,
			products,
			org,
			features,
			optionsList: mapOptionsList({
				optionsListInput,
				features,
				prices: products.flatMap((p) => p.prices) as Price[],
			}),
			prices: products.flatMap((p) => p.prices) as Price[],
			entitlements: products.flatMap((p) =>
				getEntsWithFeature(p.entitlements, features),
			) as EntitlementWithFeature[],
			freeTrial,
			cusProducts,
			entities: customer.entities,
			entityId: entityId,
			internalEntityId: entityId
				? customer.entities.find(
						(e) => e.id === entityId || e.internal_id === entityId,
					)?.internal_id
				: undefined,
		};
	}

	if (products.length > 1) {
		throw new RecaseError({
			message: "Cannot attach multiple products when is_custom is true",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Get cur main product
	const product = products[0];

	const { curMainProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	let curPrices: Price[] = product!.prices;
	let curEnts: Entitlement[] = product!.entitlements.map((e: Entitlement) => {
		return {
			...e,
			feature: features.find((f) => f.internal_id === e.internal_feature_id),
		};
	});

	if (curMainProduct?.product.id === product.id) {
		curPrices = getPricesForCusProduct({
			cusProduct: curMainProduct as FullCusProduct,
		});

		curEnts = curMainProduct!.customer_entitlements.map((e) => e.entitlement);
	}

	const { prices, entitlements } = await handleNewProductItems({
		db,
		curPrices,
		curEnts,
		newItems: itemsInput,
		features,
		product,
		logger,
		isCustom: true,
	});

	const freeTrial = await handleNewFreeTrial({
		db,
		curFreeTrial: product!.free_trial,
		newFreeTrial: freeTrialInput || null,
		internalProductId: product!.internal_id,
		isCustom,
	});

	const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
		db,
		freeTrial: freeTrial,
		productId: product.id,
		fingerprint: customer.fingerprint,
		internalCustomerId: customer.internal_id,
		multipleAllowed: org.config.multiple_trials,
	});

	return {
		customer,
		products,
		org,
		features,
		optionsList: mapOptionsList({
			optionsListInput,
			features,
			prices,
		}),
		prices: prices as Price[],
		entitlements: entitlements as EntitlementWithFeature[],
		freeTrial: uniqueFreeTrial,
		cusProducts,
		entities: customer.entities,
		entityId: entityId,
		internalEntityId: entityId
			? customer.entities.find(
					(e) => e.id === entityId || e.internal_id === entityId,
				)?.internal_id
			: undefined,
	};
};
