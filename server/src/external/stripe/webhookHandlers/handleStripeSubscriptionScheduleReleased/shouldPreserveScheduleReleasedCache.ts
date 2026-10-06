import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency";
import type { StripeScheduleReleasedContext } from "./stripeScheduleReleasedContext";

export const shouldPreserveScheduleReleasedCache = ({
	event,
	eventContext,
}: {
	event: Stripe.SubscriptionScheduleReleasedEvent;
	eventContext: StripeScheduleReleasedContext;
}): boolean =>
	isAutumnOriginatedStripeEvent({ event }) &&
	!eventContext.results.detachedSchedulePhases &&
	!eventContext.results.clearedAnchorResets;
