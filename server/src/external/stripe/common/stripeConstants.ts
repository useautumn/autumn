import type { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";

type StripeEventType = Stripe.WebhookEndpointCreateParams.EnabledEvent;

/** Events Autumn actively handles in its webhook handler. */
export const MAIN_STRIPE_EVENT_TYPES: StripeEventType[] = [
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
	"subscription_schedule.updated",
	"test_helpers.test_clock.ready",
];

/** Additional events needed to keep the stripe-sync DB up to date. */
export const SYNC_STRIPE_EVENT_TYPES: StripeEventType[] = [
	// customers
	"customer.created",
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

/** Bounds Stripe calls made while holding Postgres locks. */
export const LOCK_HELD_STRIPE_REQUEST_OPTIONS = {
	timeout: 10_000,
} satisfies Stripe.RequestOptions;

/** Autumn's OAuth Connect endpoints also receive revocations; direct secret-key endpoints never do. */
export const OAUTH_CONNECT_STRIPE_EVENT_TYPES: StripeEventType[] = [
	...new Set<StripeEventType>([
		...MAIN_STRIPE_EVENT_TYPES,
		...SYNC_STRIPE_EVENT_TYPES,
		"account.application.deauthorized",
	]),
];

export const buildOAuthConnectWebhookParams = ({
	publicApiUrl,
	env,
}: {
	publicApiUrl: string;
	env: AppEnv;
}) =>
	({
		url: `${publicApiUrl}/webhooks/connect/${env}`,
		enabled_events: OAUTH_CONNECT_STRIPE_EVENT_TYPES,
		connect: true,
	}) satisfies Stripe.WebhookEndpointCreateParams;
