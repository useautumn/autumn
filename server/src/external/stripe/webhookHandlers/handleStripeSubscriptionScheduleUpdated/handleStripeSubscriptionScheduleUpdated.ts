import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupScheduleUpdatedContext } from "./setupScheduleUpdatedContext.js";
import { applyStartedScheduleFuturePhaseEdit } from "./tasks/applyStartedScheduleFuturePhaseEdit.js";
import { resyncScheduledCustomerProductStartsAt } from "./tasks/resyncScheduledCustomerProductStartsAt.js";

/**
 * Re-syncs scheduled customerProduct starts_at when a not-yet-started schedule
 * is rescheduled outside Autumn (e.g. Stripe dashboard). On a started schedule
 * only an edit to a future phase is acted on; phase add/remove is left alone.
 */
export const handleStripeSubscriptionScheduleUpdated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleUpdatedEvent;
}) => {
	const eventContext = setupScheduleUpdatedContext({ ctx, event });

	await applyStartedScheduleFuturePhaseEdit({ ctx, eventContext });
	await resyncScheduledCustomerProductStartsAt({ ctx, eventContext });

	ctx.handlerResult = { type: event.type, context: eventContext };
};
