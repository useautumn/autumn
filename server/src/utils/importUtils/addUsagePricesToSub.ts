import {
	BillingInterval,
	BillingType,
	type FullProduct,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { filterByBillingType } from "@/internal/products/prices/priceUtils/findPriceUtils.js";

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
		const subItem = findStripeItemForPrice({
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
