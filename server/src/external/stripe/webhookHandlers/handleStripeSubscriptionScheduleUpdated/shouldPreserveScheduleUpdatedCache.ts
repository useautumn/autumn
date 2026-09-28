import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency";
import type { StripeScheduleUpdatedContext } from "./setupScheduleUpdatedContext";

export const shouldPreserveScheduleUpdatedCache = ({
	event,
	eventContext,
}: {
	event: Stripe.SubscriptionScheduleUpdatedEvent;
	eventContext: StripeScheduleUpdatedContext;
}): boolean => {
	if (!isAutumnOriginatedStripeEvent({ event })) return false;
	const { results } = eventContext;
	return !results.detachedFuturePhases && !results.movedPhaseStarts;
};
