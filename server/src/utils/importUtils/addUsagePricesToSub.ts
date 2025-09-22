import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { filterByBillingType } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import {
	BillingType,
	FullProduct,
	UsagePriceConfig,
	FullCusProduct,
	BillingInterval,
} from "@autumn/shared";
import Stripe from "stripe";
import { ExtendedRequest } from "../models/Request.js";
import { cusProductToPrices } from "@autumn/shared";
import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { logger } from "@/external/logtail/logtailUtils.js";

export const addContUsePricesToSub = async ({
	stripe,
	sub,
	autumnProduct,
	quantity,
	logger,
}: {
	stripe: Stripe;
	sub: Stripe.Subscription;
	autumnProduct: FullProduct;
	quantity: number;
	logger: any;
}) => {
	let usagePrices = filterByBillingType({
		prices: autumnProduct.prices,
		billingType: BillingType.InArrearProrated,
	});

	usagePrices = usagePrices.filter(
		(p) => p.config.interval !== BillingInterval.OneOff,
	);

	logger.info(`Adding ${usagePrices.length} cont use prices to sub`);

	for (const usagePrice of usagePrices) {
		const config = usagePrice.config as UsagePriceConfig;
		const latestSub = await stripe.subscriptions.retrieve(sub.id);
		let subItem = findStripeItemForPrice({
			price: usagePrice,
			stripeItems: latestSub.items.data,
		});

		if (subItem) {
			logger.info(`Sub already has price for ${config.feature_id}`);
			continue;
		}

		const newSubItem = await stripe.subscriptionItems.create({
			subscription: sub.id,
			price: usagePrice.config.stripe_price_id!,
			proration_behavior: "none",
			quantity,
		});

		// logger.info(`New sub item:`, {
		//   newSubItem,
		// });

		logger.info(`Successfully added ${config.feature_id} to sub`);
	}
};

export const addUsagePricesToSub = async ({
	req,
	stripeCli,
	stripeSub,
	cusProduct,
}: {
	req: ExtendedRequest;
	stripeCli: Stripe;
	stripeSub: Stripe.Subscription;
	cusProduct: FullCusProduct;
}) => {
	const { features } = req;
	const prices = cusProductToPrices({
		cusProduct,
		billingType: BillingType.UsageInArrear,
	});

	for (const price of prices) {
		const feature = priceToFeature({ price, features: features });
		const usageBasedSub = await getUsageBasedSub({
			stripeCli,
			subIds: cusProduct.subscription_ids || [],
			feature: feature!,
			db: req.db,
		});

		let subItem = findStripeItemForPrice({
			price,
			stripeItems: stripeSub.items.data,
		});

		let config = price.config as UsagePriceConfig;
		if (subItem) {
			logger.info(`Sub already has price for ${config.feature_id}`);
			continue;
		}

		logger.info(`Adding ${config.feature_id} to sub ${stripeSub.id}`);
		let stripePrice = await stripeCli.prices.retrieve(
			price.config.stripe_price_id!,
		);

		if (stripePrice.recurring?.usage_type !== "metered") {
			logger.info(
				`Skipping ${config.feature_id} because it's not a metered price`,
			);
			continue;
		}

		await stripeCli.subscriptionItems.create({
			subscription: stripeSub.id,
			price: price.config.stripe_price_id!,
			proration_behavior: "none",
		});

		logger.info(`Successfully added ${config.feature_id} to sub`);
	}
};
