import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import type { StripeScheduleReleasedContext } from "./stripeScheduleReleasedContext.js";
import { clearReleasedScheduleAnchorResets } from "./tasks/clearReleasedScheduleAnchorResets.js";
import { detachReleasedSchedulePhases } from "./tasks/detachReleasedSchedulePhases.js";

export const handleStripeSubscriptionScheduleReleased = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleReleasedEvent;
}) => {
	const eventContext: StripeScheduleReleasedContext = {
		schedule: event.data.object,
		results: {},
	};

	await detachReleasedSchedulePhases({ ctx, eventContext });
	await clearReleasedScheduleAnchorResets({ ctx, eventContext });

	ctx.handlerResult = { type: event.type, context: eventContext };
};
