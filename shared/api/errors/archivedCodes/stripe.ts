/**
 * Stripe integration error codes
 */
export const StripeErrorCode = {
	StripeError: "stripe_error",
	StripeKeyInvalid: "stripe_key_invalid",
	StripeKeyNotFound: "stripe_key_not_found",
	StripeConfigNotFound: "stripe_config_not_found",

	// Stripe Operations
	StripeDeleteCustomerFailed: "stripe_delete_customer_failed",
	StripeCreateCustomerFailed: "stripe_create_customer_failed",
	StripeCreateProductFailed: "stripe_create_product_failed",
	StripeCancelSubscriptionFailed: "stripe_cancel_subscription_failed",
	StripeGetPaymentMethodFailed: "stripe_get_payment_method_failed",
	StripeCardDeclined: "stripe_card_declined",
	StripeUpdateSubscriptionFailed: "stripe_update_subscription_failed",
	StripeCancelSubscriptionScheduleFailed:
		"stripe_cancel_subscription_schedule_failed",
	StripeCreateSubscriptionFailed: "stripe_create_subscription_failed",
	CreateStripeSubscriptionFailed: "create_stripe_subscription_failed",
} as const;

export type StripeErrorCode =
	(typeof StripeErrorCode)[keyof typeof StripeErrorCode];
