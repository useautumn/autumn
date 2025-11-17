import {
	ACTIVE_STATUSES,
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { newCusToAttachParams } from "../attach/attachUtils/attachParams/convertToParams.js";
import { initStripeCusAndProducts } from "../handlers/handleCreateCustomer.js";
import { CusProductService, RELEVANT_STATUSES } from "./CusProductService.js";
import { getExistingCusProducts } from "./cusProductUtils/getExistingCusProducts.js";

export const getDefaultProduct = async ({
	req,
	productGroup,
}: {
	req: ExtendedRequest;
	productGroup: string;
}) => {
	const { db, org, env, logger } = req;
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const defaultProd = defaultProducts.find(
		(p) =>
			p.group === productGroup && !isDefaultTrialFullProduct({ product: p }),
	);

	return defaultProd;
};

// This function is only used in cancellation flows
export const activateDefaultProduct = async ({
	req,
	productGroup,
	fullCus,
	curCusProduct,
}: {
	req: ExtendedRequest;
	productGroup: string;
	fullCus: FullCustomer;
	curCusProduct?: FullCusProduct;
}) => {
	const { db, org, env, logger } = req;
	// 1. Expire current product
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	// Look for a paid default trial first, then fall back to free default
	const defaultProd: FullProduct | undefined = defaultProducts.find(
		(p) =>
			p.group === productGroup && !isDefaultTrialFullProduct({ product: p }),
	);

	if (!defaultProd) return false;

	if (curCusProduct?.internal_product_id === defaultProd.internal_id) {
		return false;
	}

	const stripeCli = createStripeCli({ org, env });
	const defaultIsFree = isFreeProduct(defaultProd.prices);

	// Initialize Stripe customer and products if needed (for paid non-trial products)
	if (!defaultIsFree) {
		await initStripeCusAndProducts({
			db,
			org,
			env,
			customer: fullCus,
			products: [defaultProd],
			logger,
		});
	}

	// If default is already active, skip
	const existingDefaultProduct = fullCus.customer_products.find(
		(cp) =>
			cp.product.id === defaultProd?.id && ACTIVE_STATUSES.includes(cp.status),
	);

	if (existingDefaultProduct) {
		logger.info(
			`Default product ${defaultProd?.name} already exists for customer`,
		);
		return false;
	}

	await handleAddProduct({
		req,
		attachParams: newCusToAttachParams({
			req,
			newCus: fullCus,
			products: [defaultProd],
			stripeCli,
		}),
	});

	return true;
};

export const activateFutureProduct = async ({
	req,
	cusProduct,
}: {
	req: ExtendedRequest;
	cusProduct: FullCusProduct;
}) => {
	const { db, org, env, logger } = req;

	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: cusProduct.internal_customer_id,
		inStatuses: [CusProductStatus.Scheduled],
	});

	const { curScheduledProduct: futureProduct } = getExistingCusProducts({
		product: cusProduct.product,
		cusProducts,
		internalEntityId: cusProduct.internal_entity_id,
	});

	if (!futureProduct) {
		return false;
	}

	await CusProductService.update({
		db,
		cusProductId: futureProduct.id,
		updates: { status: CusProductStatus.Active },
	});

	await addProductsUpdatedWebhookTask({
		req,
		internalCustomerId: cusProduct.internal_customer_id,
		org,
		env,
		customerId: null,
		scenario: AttachScenario.New,
		cusProduct: futureProduct,
		logger,
	});

	return futureProduct;
};

// export const processFullCusProduct = ({
// 	cusProduct,
// 	subs,
// 	org,
// 	entities = [],
// 	apiVersion,
// }: {
// 	cusProduct: FullCusProduct;
// 	org: Organization;
// 	subs?: Subscription[];
// 	entities?: Entity[];
// 	apiVersion: ApiVersionClass;
// }) => {
// 	// Process prices

// 	const prices = cusProduct.customer_prices.map((cp) => {
// 		const price = cp.price;

// 		if (price.config?.type === PriceType.Fixed) {
// 			const config = price.config as FixedPriceConfig;
// 			return {
// 				amount: config.amount,
// 				interval: config.interval,
// 			};
// 		} else {
// 			const config = price.config as UsagePriceConfig;
// 			const priceOptions = getPriceOptions(price, cusProduct.options);
// 			const usageTier = getUsageTier(price, priceOptions?.quantity!);
// 			const cusEnt = getRelatedCusEnt({
// 				cusPrice: cp,
// 				cusEnts: cusProduct.customer_entitlements,
// 			});

// 			const ent = cusEnt?.entitlement;

// 			const singleTier =
// 				ent?.allowance === 0 && config.usage_tiers.length === 1;

// 			if (singleTier) {
// 				return {
// 					amount: usageTier.amount,
// 					interval: config.interval,
// 					quantity: priceOptions?.quantity,
// 				};
// 			} else {
// 				// Add allowance to tiers
// 				const allowance = ent?.allowance;
// 				let tiers;

// 				if (notNullish(allowance) && allowance! > 0) {
// 					tiers = [
// 						{
// 							to: allowance,
// 							amount: 0,
// 						},
// 						...config.usage_tiers.map((tier) => {
// 							const isLastTier = tier.to === -1 || tier.to === TierInfinite;
// 							return {
// 								to: isLastTier ? tier.to : Number(tier.to) + allowance!,
// 								amount: tier.amount,
// 							};
// 						}),
// 					];
// 				} else {
// 					tiers = config.usage_tiers.map((tier) => {
// 						const isLastTier = tier.to === -1 || tier.to === TierInfinite;
// 						return {
// 							to: isLastTier ? tier.to : Number(tier.to) + allowance!,
// 							amount: tier.amount,
// 						};
// 					});
// 				}

// 				return {
// 					tiers: tiers,
// 					name: "",
// 					quantity: priceOptions?.quantity,
// 				};
// 			}
// 		}
// 	});

// 	const trialing =
// 		cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

// 	const subIds = cusProduct.subscription_ids;
// 	let stripeSubData = {};

// 	if (subIds && subIds.length > 0 && apiVersion.gte(ApiVersion.V0_2)) {
// 		const baseSub = subs?.find(
// 			(s) => s.id === subIds[0] || (s as Subscription).stripe_id === subIds[0],
// 		);
// 		stripeSubData = {
// 			current_period_end: baseSub?.current_period_end
// 				? baseSub.current_period_end * 1000
// 				: null,
// 			current_period_start: baseSub?.current_period_start
// 				? baseSub.current_period_start * 1000
// 				: null,
// 		};
// 	}

// 	if (!subIds && trialing) {
// 		stripeSubData = {
// 			current_period_start: cusProduct.starts_at,
// 			current_period_end: cusProduct.trial_ends_at,
// 		};
// 	}

// 	if (apiVersion.gte(ApiVersion.V1_1)) {
// 		if ((!subIds || subIds.length === 0) && trialing) {
// 			stripeSubData = {
// 				current_period_start: cusProduct.starts_at,
// 				current_period_end: cusProduct.trial_ends_at,
// 			};
// 		}

// 		return ApiSubscriptionSchema.parse({
// 			id: cusProduct.product.id,
// 			name: cusProduct.product.name,
// 			group: cusProduct.product.group || null,
// 			status: trialing ? CusProductStatus.Trialing : cusProduct.status,
// 			canceled_at: cusProduct.canceled_at,
// 			is_default: cusProduct.product.is_default || false,
// 			is_add_on: cusProduct.product.is_add_on || false,
// 			stripe_subscription_ids: cusProduct.subscription_ids || [],
// 			started_at: cusProduct.starts_at,
// 			entity_id: cusProduct.internal_entity_id
// 				? entities?.find((e) => e.internal_id === cusProduct.internal_entity_id)
// 						?.id
// 				: cusProduct.entity_id || undefined,

// 			...stripeSubData,
// 		});
// 	} else {
// 		const cusProductResponse = {
// 			id: cusProduct.product.id,
// 			name: cusProduct.product.name,
// 			group: cusProduct.product.group,
// 			status: trialing ? CusProductStatus.Trialing : cusProduct.status,
// 			created_at: cusProduct.created_at,
// 			canceled_at: cusProduct.canceled_at,
// 			processor: {
// 				type: cusProduct.processor?.type,
// 				subscription_id: cusProduct.processor?.subscription_id || null,
// 			},
// 			subscription_ids: cusProduct.subscription_ids || [],
// 			prices: prices,
// 			starts_at: cusProduct.starts_at,

// 			...stripeSubData,
// 		};

// 		return cusProductResponse;
// 	}
// };

export const searchCusProducts = ({
	productId,
	internalProductId,
	internalEntityId,
	cusProducts,
	status,
}: {
	productId?: string;
	internalProductId?: string;
	internalEntityId?: string;
	cusProducts: FullCusProduct[];
	status?: CusProductStatus;
}) => {
	if (!cusProducts) {
		return undefined;
	}
	return cusProducts.find((cusProduct: FullCusProduct) => {
		let prodIdMatch = false;
		if (productId) {
			prodIdMatch = cusProduct.product.id === productId;
		} else if (internalProductId) {
			prodIdMatch = cusProduct.product.internal_id === internalProductId;
		}
		return (
			prodIdMatch &&
			(status ? cusProduct.status === status : true) &&
			(internalEntityId
				? cusProduct.internal_entity_id === internalEntityId
				: nullish(cusProduct.internal_entity_id))
		);
	});
};

export const getMainCusProduct = async ({
	db,
	internalCustomerId,
	productGroup,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	productGroup?: string;
}) => {
	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId,
		inStatuses: RELEVANT_STATUSES,
	});

	const mainCusProduct = cusProducts.find(
		(cusProduct: FullCusProduct) =>
			!cusProduct.product.is_add_on &&
			(productGroup ? cusProduct.product.group === productGroup : true),
	);

	return mainCusProduct as FullCusProduct;
};

export const getCusProductsWithStripeSubId = ({
	cusProducts,
	stripeSubId,
	curCusProductId,
}: {
	cusProducts: FullCusProduct[];
	stripeSubId: string;
	curCusProductId?: string;
}) => {
	return cusProducts.filter(
		(cusProduct) =>
			cusProduct.subscription_ids?.includes(stripeSubId) &&
			cusProduct.id !== curCusProductId,
	);
};

export const getFeatureQuantity = ({
	cusProduct,
	internalFeatureId,
}: {
	cusProduct: FullCusProduct;
	internalFeatureId: string;
}) => {
	const options = cusProduct.options;
	const option = options.find(
		(o) => o.internal_feature_id === internalFeatureId,
	);
	return nullish(option?.quantity) ? 1 : option?.quantity!;
};
