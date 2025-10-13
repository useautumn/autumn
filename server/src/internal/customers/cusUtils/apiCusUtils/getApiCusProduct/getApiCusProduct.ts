import {
	ApiCusProductSchema,
	type CusProductLegacyData,
	CusProductStatus,
	cusProductToProduct,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	type Subscription,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";

// const prices = cusProduct.customer_prices.map((cp) => {
// 	const price = cp.price;

// 	if (price.config?.type === PriceType.Fixed) {
// 		const config = price.config as FixedPriceConfig;
// 		return {
// 			amount: config.amount,
// 			interval: config.interval,
// 		};
// 	} else {
// 		const config = price.config as UsagePriceConfig;
// 		const priceOptions = getPriceOptions(price, cusProduct.options);
// 		const usageTier = getUsageTier(price, priceOptions?.quantity!);
// 		const cusEnt = getRelatedCusEnt({
// 			cusPrice: cp,
// 			cusEnts: cusProduct.customer_entitlements,
// 		});

// 		const ent = cusEnt?.entitlement;

// 		const singleTier =
// 			ent?.allowance === 0 && config.usage_tiers.length === 1;

// 		if (singleTier) {
// 			return {
// 				amount: usageTier.amount,
// 				interval: config.interval,
// 				quantity: priceOptions?.quantity,
// 			};
// 		} else {
// 			// Add allowance to tiers
// 			const allowance = ent?.allowance;
// 			let tiers;

// 			if (notNullish(allowance) && allowance! > 0) {
// 				tiers = [
// 					{
// 						to: allowance,
// 						amount: 0,
// 					},
// 					...config.usage_tiers.map((tier) => {
// 						const isLastTier = tier.to === -1 || tier.to === TierInfinite;
// 						return {
// 							to: isLastTier ? tier.to : Number(tier.to) + allowance!,
// 							amount: tier.amount,
// 						};
// 					}),
// 				];
// 			} else {
// 				tiers = config.usage_tiers.map((tier) => {
// 					const isLastTier = tier.to === -1 || tier.to === TierInfinite;
// 					return {
// 						to: isLastTier ? tier.to : Number(tier.to) + allowance!,
// 						amount: tier.amount,
// 					};
// 				});
// 			}

// 			return {
// 				tiers: tiers,
// 				name: "",
// 				quantity: priceOptions?.quantity,
// 			};
// 		}
// 	}
// });

export const getApiCusProduct = async ({
	ctx,
	fullCus,
	cusProduct,
	entities,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	entities?: Entity[];
}) => {
	const { org } = ctx;
	const trialing =
		cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

	const fullProduct = cusProductToProduct({ cusProduct });
	const v2Product = await getProductResponse({
		product: fullProduct,
		features: ctx.features,
		fullCus,
		currency: org.default_currency || "usd",
		options: cusProduct.options,
		withDisplay: false,
	});

	const entity = entities?.find(
		(e) => e.internal_id === cusProduct.internal_entity_id,
	);

	const subId = cusProduct.subscription_ids?.[0];
	const autumnSub = fullCus.subscriptions?.find(
		(s) => s.id === subId || (s as Subscription).stripe_id === subId,
	);

	let stripeSubData = {};
	if (autumnSub) {
		stripeSubData = {
			current_period_end: autumnSub?.current_period_end
				? autumnSub.current_period_end * 1000
				: null,
			current_period_start: autumnSub?.current_period_start
				? autumnSub.current_period_start * 1000
				: null,
		};
	}

	if (!subId && trialing) {
		stripeSubData = {
			current_period_start: cusProduct.starts_at,
			current_period_end: cusProduct.trial_ends_at,
		};
	}

	const apiCusProduct = ApiCusProductSchema.parse({
		id: fullProduct.id,
		name: fullProduct.name,
		group: fullProduct.group || null,
		status: trialing ? CusProductStatus.Trialing : cusProduct.status,
		canceled_at: cusProduct.canceled_at || null,

		is_default: fullProduct.is_default || false,
		is_add_on: fullProduct.is_add_on || false,
		version: fullProduct.version,
		quantity: cusProduct.quantity,

		started_at: cusProduct.starts_at,
		entity_id: entity?.id || cusProduct.entity_id || undefined,

		...stripeSubData,
		items: v2Product.items,
	});

	return {
		data: apiCusProduct,
		legacyData: {
			subscription_id: subId || undefined,
		} satisfies CusProductLegacyData,
	};

	// if (subIds && subIds.length > 0 && apiVersion.gte(ApiVersion.V0_2)) {
	// 	const baseSub = subs?.find(
	// 		(s) => s.id === subIds[0] || (s as Subscription).stripe_id === subIds[0],
	// 	);
	// 	stripeSubData = {
	// 		current_period_end: baseSub?.current_period_end
	// 			? baseSub.current_period_end * 1000
	// 			: null,
	// 		current_period_start: baseSub?.current_period_start
	// 			? baseSub.current_period_start * 1000
	// 			: null,
	// 	};
	// }

	// if (!subIds && trialing) {
	// 	stripeSubData = {
	// 		current_period_start: cusProduct.starts_at,
	// 		current_period_end: cusProduct.trial_ends_at,
	// 	};
	// }

	// if (apiVersion.gte(ApiVersion.V1_1)) {
	// 	if ((!subIds || subIds.length === 0) && trialing) {
	// 		stripeSubData = {
	// 			current_period_start: cusProduct.starts_at,
	// 			current_period_end: cusProduct.trial_ends_at,
	// 		};
	// 	}

	// 	const fullProduct = fullCusProductToProduct(cusProduct);
	// 	const v2Product = await getProductResponse({
	// 		product: fullProduct,
	// 		features,
	// 		withDisplay: false,
	// 		options: cusProduct.options,
	// 	});

	// 	return ApiCusProductSchema.parse({
	// 		id: fullProduct.id,
	// 		name: fullProduct.name,
	// 		group: fullProduct.group || null,
	// 		status: trialing ? CusProductStatus.Trialing : cusProduct.status,
	// 		canceled_at: cusProduct.canceled_at || null,

	// 		is_default: fullProduct.is_default || false,
	// 		is_add_on: fullProduct.is_add_on || false,
	// 		version: fullProduct.version,
	// 		quantity: cusProduct.quantity,

	// 		started_at: cusProduct.starts_at,
	// 		entity_id: entity?.id || cusProduct.entity_id || undefined,

	// 		...stripeSubData,
	// 		items: v2Product.items,
	// 	});
	// } else {
	// 	const cusProductResponse = {
	// 		id: cusProduct.product.id,
	// 		name: cusProduct.product.name,
	// 		group: cusProduct.product.group,
	// 		status: trialing ? CusProductStatus.Trialing : cusProduct.status,
	// 		created_at: cusProduct.created_at,
	// 		canceled_at: cusProduct.canceled_at,
	// 		processor: {
	// 			type: cusProduct.processor?.type,
	// 			subscription_id: cusProduct.processor?.subscription_id || null,
	// 		},
	// 		subscription_ids: cusProduct.subscription_ids || [],
	// 		prices: prices,
	// 		starts_at: cusProduct.starts_at,

	// 		...stripeSubData,
	// 	};

	// 	return cusProductResponse;
	// }
};
