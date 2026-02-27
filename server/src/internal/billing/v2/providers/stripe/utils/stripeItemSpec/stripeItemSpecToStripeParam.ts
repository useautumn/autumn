import type { StripeInlinePrice, StripeItemSpec } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Returns the price param for a StripeItemSpec — either a stored price ID or inline price_data.
 */
const toPriceParam = ({
	spec,
}: {
	spec: StripeItemSpec;
}): { price: string } | { price_data: StripeInlinePrice } => {
	if (spec.stripeInlinePrice) {
		return { price_data: spec.stripeInlinePrice };
	}
	return { price: spec.stripePriceId! };
};

/** Converts a StripeItemSpec to a Stripe subscription item param (create or update). */
export const stripeItemSpecToSubscriptionItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.SubscriptionCreateParams.Item => {
	return {
		...toPriceParam({ spec }),
		...(spec.quantity !== undefined && { quantity: spec.quantity }),
		...(spec.metadata && { metadata: spec.metadata }),
	};
};

/** Converts a StripeItemSpec to a Stripe checkout session line item. */
export const stripeItemSpecToCheckoutLineItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.Checkout.SessionCreateParams.LineItem => {
	return {
		...toPriceParam({ spec }),
		quantity: spec.quantity ?? 0,
	};
};

/** Converts a StripeItemSpec to a Stripe subscription schedule phase item. */
export const stripeItemSpecToPhaseItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.SubscriptionScheduleUpdateParams.Phase.Item => {
	return {
		...toPriceParam({ spec }),
		...(spec.quantity !== undefined && { quantity: spec.quantity }),
		...(spec.metadata && { metadata: spec.metadata }),
	} as Stripe.SubscriptionScheduleUpdateParams.Phase.Item;
};
