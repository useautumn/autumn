import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

export const AUTUMN_STRIPE_IDEMPOTENCY_PREFIX = "autumn:";

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
