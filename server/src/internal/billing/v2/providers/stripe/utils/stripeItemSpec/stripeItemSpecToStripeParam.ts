import {
	InternalError,
	type StripeInlinePrice,
	type StripeItemSpec,
} from "@autumn/shared";
import type Stripe from "stripe";

type StoredPriceParam = { price: string };
type RecurringInlinePriceParam = {
	price_data: Stripe.SubscriptionCreateParams.Item["price_data"];
};

/**
 * Returns the price param for a StripeItemSpec — either a stored price ID or inline price_data.
 * For inline prices, asserts that `recurring` is present (one-off items should not reach this path).
 */
const toRecurringPriceParam = ({
	spec,
}: {
	spec: StripeItemSpec;
}): StoredPriceParam | RecurringInlinePriceParam => {
	if (spec.stripeInlinePrice) {
		if (!spec.stripeInlinePrice.recurring) {
			throw new InternalError({
				message:
					"stripeItemSpecToSubscriptionItem called with non-recurring inline price — one-off items should use the invoice path",
				code: "inline_price_missing_recurring",
			});
		}
		return {
			price_data: {
				...spec.stripeInlinePrice,
				recurring: spec.stripeInlinePrice.recurring,
			},
		};
	}
	return { price: spec.stripePriceId! };
};

/** Converts a StripeItemSpec to a Stripe subscription item param (create or update).
 *  Only call with recurring specs — one-off items use a separate invoice path. */
export const stripeItemSpecToSubscriptionItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.SubscriptionCreateParams.Item => {
	return {
		...toRecurringPriceParam({ spec }),
		...(spec.quantity !== undefined && { quantity: spec.quantity }),
		...(spec.metadata && { metadata: spec.metadata }),
	};
};

/** Returns a price param without recurring validation — for checkout line items. */
const toPriceParam = ({
	spec,
}: {
	spec: StripeItemSpec;
}): StoredPriceParam | { price_data: StripeInlinePrice } => {
	if (spec.stripeInlinePrice) {
		return { price_data: spec.stripeInlinePrice };
	}
	return { price: spec.stripePriceId! };
};

/** Converts a StripeItemSpec to a Stripe checkout session line item. */
export const stripeItemSpecToCheckoutLineItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.Checkout.SessionCreateParams.LineItem => {
	return {
		...toPriceParam({ spec }),
		quantity: spec.quantity,
	};
};

/** Converts a StripeItemSpec to a Stripe subscription schedule phase item. */
export const stripeItemSpecToPhaseItem = ({
	spec,
}: {
	spec: StripeItemSpec;
}): Stripe.SubscriptionScheduleUpdateParams.Phase.Item => {
	return {
		...toRecurringPriceParam({ spec }),
		...(spec.quantity !== undefined && { quantity: spec.quantity }),
		...(spec.metadata && { metadata: spec.metadata }),
	} as Stripe.SubscriptionScheduleUpdateParams.Phase.Item;
};
