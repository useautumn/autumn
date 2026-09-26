import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

export const AUTUMN_STRIPE_IDEMPOTENCY_PREFIX = "autumn:";

export const AUTUMN_INVOICE_PAY_SOURCE = "invoice.pay";

/** Unique per call — Stripe rejects a reused key on a different request. */
export const buildAutumnStripeIdempotencyKey = ({
	source,
}: {
	source?: string;
}): string =>
	`${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}${source ?? "billing"}:${randomUUID()}`;

export const autumnStripeRequestOptions = ({
	source,
}: {
	source?: string;
} = {}): Stripe.RequestOptions => ({
	idempotencyKey: buildAutumnStripeIdempotencyKey({ source }),
});

/** True when the event was caused by an Autumn API call (vs external/automatic). */
export const isAutumnOriginatedStripeEvent = ({
	event,
}: {
	event: Stripe.Event;
}): boolean =>
	Boolean(
		event.request?.idempotency_key?.startsWith(
			AUTUMN_STRIPE_IDEMPOTENCY_PREFIX,
		),
	);

/**
 * True when Stripe's dunning rules cancelled the subscription after a failed
 * charge. The cancel inherits the idempotency key of Autumn's `invoices.pay`
 * call, so it looks autumn-originated, but Autumn never meant to cancel.
 */
export const isStripeDunningSubscriptionDeletion = ({
	event,
}: {
	event: Stripe.CustomerSubscriptionDeletedEvent;
}): boolean =>
	event.data.object.cancellation_details?.reason === "payment_failed" ||
	Boolean(
		event.request?.idempotency_key?.startsWith(
			`${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}${AUTUMN_INVOICE_PAY_SOURCE}:`,
		),
	);
