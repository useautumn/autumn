import {
	BillingInterval,
	type CusProductStatus,
	type EntitlementWithFeature,
	type FullCustomer,
	type FullProduct,
	isUsagePrice,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { stripeToAutumnSubStatus } from "@/external/stripe/stripeSubUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { constructSub } from "@/internal/subscriptions/subUtils.js";
import { notNullish } from "../genUtils.js";
import type { ExtendedRequest } from "../models/Request.js";

export const addProductFromSubs = async ({
	req,
	autumnCus,
	autumnProduct,
	sub,
	prices,
	entitlements,
	force = false,
	isCustom = false,
	anchorToUnix,
}: {
	req: ExtendedRequest;
	autumnCus: FullCustomer;
	autumnProduct: FullProduct;
	sub?: Stripe.Subscription;
	prices?: Price[];
	entitlements?: EntitlementWithFeature[];
	force?: boolean;
	isCustom?: boolean;
	anchorToUnix?: number;
}) => {
	const { db, logger, org, env } = req;

	const cusProducts = autumnCus.customer_products;
	const entity = autumnCus.entity;

	const mainCusProduct = cusProducts.find(
		(cp) =>
			!cp.product.is_add_on &&
			cp.product_id === autumnProduct.id &&
			(notNullish(entity)
				? cp.internal_entity_id === entity!.internal_id
				: true),
	);

	if (mainCusProduct && !force) {
		const prices = mainCusProduct.customer_prices.map((cp) => cp.price);
		// let isFree = isFreeProduct(prices);

		if (mainCusProduct) {
			logger.info(
				`Customer ${
					autumnCus.id || autumnCus.email
				} already has non-free free product: ${
					mainCusProduct.product.name
				}, skipping...`,
			);
			return mainCusProduct;
		}
	}

	// Handle if trialing
	const trialEndsAt = sub?.trial_end ? sub.trial_end * 1000 : null;

	// throw new Error("test");

	// 1. Insert custom prices...
	const customPrices = prices?.filter((p) => p.is_custom);
	if (customPrices && customPrices.length > 0) {
		await PriceService.upsert({
			db,
			data: customPrices,
		});
	}

	const { start, end } = subToPeriodStartEnd({
		sub,
	});

	const newCusProduct = await createFullCusProduct({
		db,
		attachParams: {
			replaceables: [],
			customer: autumnCus,
			product: autumnProduct,
			org,
			prices: notNullish(prices) ? prices! : autumnProduct.prices,
			entitlements: notNullish(entitlements)
				? entitlements!
				: autumnProduct.entitlements,
			freeTrial: autumnProduct.free_trial || null,
			optionsList: [],
			entities: [],
			cusProducts: cusProducts,
			features: [],
			internalEntityId: entity?.internal_id,
			entityId: entity?.id,
			isCustom: isCustom,
		},
		logger,
		trialEndsAt: trialEndsAt || undefined,
		subscriptionIds: sub ? [sub.id] : [],
		anchorToUnix: anchorToUnix || end,

		subscriptionStatus: sub?.status
			? (stripeToAutumnSubStatus(sub?.status) as CusProductStatus)
			: undefined,

		canceledAt: sub?.canceled_at ? sub.canceled_at * 1000 : null,

		createdAt: sub?.created ? sub.created * 1000 : null,
		sendWebhook: false,
	});

	logger.info(
		`Added product ${autumnProduct.name} to customer ${autumnCus.name}`,
	);

	if (sub) {
		// Create sub
		const usageFeatures = autumnProduct.prices
			.filter((p) => isUsagePrice({ price: p }))
			.map((p) => (p.config as UsagePriceConfig).internal_feature_id);

		const subFromDb = await SubService.getInStripeIds({
			db,
			ids: [sub.id],
		});

		const subInterval = subToAutumnInterval(sub);

		if (subFromDb.length === 0) {
			await SubService.createSub({
				db,
				sub: constructSub({
					stripeId: sub.id,
					usageFeatures:
						subInterval.interval === BillingInterval.Month ? usageFeatures : [],
					orgId: org.id,
					env,
					currentPeriodStart: start,
					currentPeriodEnd: end,
				}),
			});
			logger.info(`Created sub ${sub.id} in DB`);
		} else {
			logger.info(`Sub ${sub.id} already exists in DB`);
		}
	}

	autumnCus.customer_products = [
		...(autumnCus.customer_products || []),
		newCusProduct!,
	];

	return newCusProduct;
};
