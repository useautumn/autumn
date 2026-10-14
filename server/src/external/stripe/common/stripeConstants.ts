import type Stripe from "stripe";

type StripeEventType = Stripe.WebhookEndpointCreateParams.EnabledEvent;

export const MAIN_STRIPE_EVENT_TYPES: StripeEventType[] = [
	"account.application.deauthorized",
	"checkout.session.completed",
	"checkout.session.expired",
	"customer.updated",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.discount.deleted",
	"invoice.paid",
	"invoice.upcoming",
	"invoice.created",
	"invoice.finalized",
	"invoice.updated",
	"subscription_schedule.canceled",
	"subscription_schedule.released",
	"subscription_schedule.updated",
	"test_helpers.test_clock.ready",
];

export const SYNC_STRIPE_EVENT_TYPES: StripeEventType[] = [
	"customer.created",
	"customer.deleted",

	"customer.subscription.paused",
	"customer.subscription.resumed",

	"subscription_schedule.created",
	"subscription_schedule.completed",

	"payment_method.attached",
	"payment_method.detached",
	"payment_method.updated",

	"product.created",
	"product.updated",
	"product.deleted",

	"price.created",
	"price.updated",
	"price.deleted",

	"invoice.deleted",
	"invoice.payment_failed",
	"invoice.payment_succeeded",
	"invoice.voided",
	"invoice.marked_uncollectible",

	"payment_intent.created",
	"payment_intent.succeeded",
	"payment_intent.payment_failed",
	"payment_intent.canceled",
];
