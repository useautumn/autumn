import type Stripe from "stripe";

const SUBSCRIPTION_UPDATE_RESERVED_KEYS = [
	"items",
	"cancel_at",
	"proration_behavior",
	"payment_behavior",
	"trial_end",
	"trial_settings",
	"discounts",
	"automatic_tax",
	"metadata",
	"expand",
	"default_payment_method",
	"default_tax_rates",
	"billing_cycle_anchor",
	"collection_method",
	"days_until_due",
	"payment_settings",
] as const satisfies readonly (keyof Stripe.SubscriptionUpdateParams)[];

const SUBSCRIPTION_CANCEL_RESERVED_KEYS = [
	"expand",
] as const satisfies readonly (keyof Stripe.SubscriptionCancelParams)[];

const omitReservedKeys = ({
	params,
	reservedKeys,
}: {
	params?: Record<string, unknown>;
	reservedKeys: readonly string[];
}): Record<string, unknown> => {
	if (!params) return {};
	return Object.fromEntries(
		Object.entries(params).filter(([key]) => !reservedKeys.includes(key)),
	);
};

export const buildStripeSubscriptionUpdateParams = ({
	params,
	subscriptionParams,
}: {
	params: Stripe.SubscriptionUpdateParams;
	subscriptionParams?: Record<string, unknown>;
}): Stripe.SubscriptionUpdateParams => ({
	...(omitReservedKeys({
		params: subscriptionParams,
		reservedKeys: SUBSCRIPTION_UPDATE_RESERVED_KEYS,
	}) as Stripe.SubscriptionUpdateParams),
	...params,
});

export const buildStripeSubscriptionCancelParams = ({
	params,
	subscriptionParams,
}: {
	params: Stripe.SubscriptionCancelParams;
	subscriptionParams?: Record<string, unknown>;
}): Stripe.SubscriptionCancelParams => ({
	...(omitReservedKeys({
		params: subscriptionParams,
		reservedKeys: SUBSCRIPTION_CANCEL_RESERVED_KEYS,
	}) as Stripe.SubscriptionCancelParams),
	...params,
});
