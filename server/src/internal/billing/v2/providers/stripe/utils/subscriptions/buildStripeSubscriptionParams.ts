import type Stripe from "stripe";

type StripeParamPolicy = "reserved" | "pass";

/**
 * Every Stripe `subscriptions.update` key, classified.
 * `reserved` is Autumn-owned billing structure; `pass` is user extras.
 * Adding a Stripe field fails typecheck until it is classified here.
 */
export const SUBSCRIPTION_UPDATE_KEY_POLICY = {
	add_invoice_items: "reserved",
	application_fee_percent: "pass",
	automatic_tax: "reserved",
	billing_cadence: "pass",
	billing_cycle_anchor: "reserved",
	billing_schedules: "pass",
	billing_thresholds: "pass",
	cancel_at: "reserved",
	cancel_at_period_end: "reserved",
	cancellation_details: "pass",
	collection_method: "reserved",
	days_until_due: "reserved",
	default_payment_method: "reserved",
	default_source: "pass",
	default_tax_rates: "reserved",
	description: "pass",
	discounts: "reserved",
	expand: "reserved",
	invoice_settings: "pass",
	items: "reserved",
	metadata: "reserved",
	off_session: "pass",
	on_behalf_of: "pass",
	pause_collection: "pass",
	payment_behavior: "reserved",
	payment_settings: "reserved",
	pending_invoice_item_interval: "pass",
	prebilling: "pass",
	proration_behavior: "reserved",
	proration_date: "pass",
	transfer_data: "pass",
	trial_end: "reserved",
	trial_from_plan: "reserved",
	trial_settings: "reserved",
} as const satisfies Record<
	keyof Stripe.SubscriptionUpdateParams,
	StripeParamPolicy
>;

/**
 * Every Stripe `subscriptions.cancel` key, classified.
 * `invoice_now` / `prorate` stay Autumn-owned so they cannot bypass refund_last_payment.
 */
export const SUBSCRIPTION_CANCEL_KEY_POLICY = {
	cancellation_details: "pass",
	expand: "reserved",
	invoice_now: "reserved",
	prorate: "reserved",
} as const satisfies Record<
	keyof Stripe.SubscriptionCancelParams,
	StripeParamPolicy
>;

const reservedKeysOf = <Policy extends Record<string, StripeParamPolicy>>({
	policy,
}: {
	policy: Policy;
}): Array<Extract<keyof Policy, string>> =>
	(Object.keys(policy) as Array<Extract<keyof Policy, string>>).filter(
		(key) => policy[key] === "reserved",
	);

export const SUBSCRIPTION_UPDATE_RESERVED_KEYS = reservedKeysOf({
	policy: SUBSCRIPTION_UPDATE_KEY_POLICY,
});

export const SUBSCRIPTION_CANCEL_RESERVED_KEYS = reservedKeysOf({
	policy: SUBSCRIPTION_CANCEL_KEY_POLICY,
});

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
