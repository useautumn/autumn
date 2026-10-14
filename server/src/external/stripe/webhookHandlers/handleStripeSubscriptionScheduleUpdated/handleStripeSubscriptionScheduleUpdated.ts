import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupScheduleUpdatedContext } from "./setupScheduleUpdatedContext.js";
import { applyStartedScheduleFuturePhaseEdit } from "./tasks/applyStartedScheduleFuturePhaseEdit.js";
import { resyncScheduledCustomerProductStartsAt } from "./tasks/resyncScheduledCustomerProductStartsAt.js";

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
