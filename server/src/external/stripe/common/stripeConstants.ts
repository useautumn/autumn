import type Stripe from "stripe";

type StripeEventType = Stripe.WebhookEndpointCreateParams.EnabledEvent;

/** Events Autumn actively handles in its webhook handler. */
export const MAIN_STRIPE_EVENT_TYPES: StripeEventType[] = [
	"checkout.session.completed",
	"checkout.session.expired",
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
	"subscription_schedule.updated",
];

/** Additional events needed to keep the stripe-sync DB up to date. */
export const SYNC_STRIPE_EVENT_TYPES: StripeEventType[] = [
	// customers
	"customer.created",
	"customer.updated",
	"customer.deleted",

	// subscriptions (extras beyond main)
	"customer.subscription.paused",
	"customer.subscription.resumed",

	// subscription schedules (extras beyond main)
	"subscription_schedule.created",
	"subscription_schedule.completed",
	"subscription_schedule.released",

	// payment methods
	"payment_method.attached",
	"payment_method.detached",
	"payment_method.updated",

	// products
	"product.created",
	"product.updated",
	"product.deleted",

	// prices
	"price.created",
	"price.updated",
	"price.deleted",

	// invoices (extras beyond main)
	"invoice.deleted",
	"invoice.payment_failed",
	"invoice.payment_succeeded",
	"invoice.voided",
	"invoice.marked_uncollectible",

	// payment intents
	"payment_intent.created",
	"payment_intent.succeeded",
	"payment_intent.payment_failed",
	"payment_intent.canceled",
];
