import type { Price } from "@models/productModels/priceModels/priceModels";
import { autumnToStripeBillingInterval } from "@utils/billingUtils/intervalUtils/autumnToStripeBillingInterval";
import type Stripe from "stripe";

export const priceToStripeRecurringParams = ({
	price,
}: {
	price: Price;
}): Stripe.PriceCreateParams.Recurring | undefined => {
	const recurringData = autumnToStripeBillingInterval({
		interval: price.config.interval,
		intervalCount: price.config.interval_count,
	});

	if (!recurringData) return undefined;

	return {
		interval: recurringData.interval,
		interval_count: recurringData.interval_count,
	};
};
