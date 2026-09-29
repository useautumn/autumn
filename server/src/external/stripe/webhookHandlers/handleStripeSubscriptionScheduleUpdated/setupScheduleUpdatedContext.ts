import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import type { SchedulePhaseMove } from "./getSchedulePhaseMoves.js";

export type StripeScheduleUpdatedResults = {
	detachedFuturePhases?: { detachedCount: number; clearedCount: number };
	movedPhaseStarts?: SchedulePhaseMove[];
};

export type StripeScheduleUpdatedContext = {
	schedule: Stripe.SubscriptionSchedule;
	/** Null unless the phases changed in place: none changed, or phases were added or removed. */
	previousPhases: Stripe.SubscriptionSchedule.Phase[] | null;
	nowSeconds: number;
	results: StripeScheduleUpdatedResults;
};

export const setupScheduleUpdatedContext = ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleUpdatedEvent;
}): StripeScheduleUpdatedContext => {
	const schedule = event.data.object;
	const previousPhases = event.data.previous_attributes?.phases ?? null;
	const phasesAddedOrRemoved =
		previousPhases !== null && previousPhases.length !== schedule.phases.length;
	if (phasesAddedOrRemoved)
		ctx.logger.warn(
			`[handleStripeSubscriptionScheduleUpdated] skipping structural phase change (${previousPhases.length} -> ${schedule.phases.length} phases) on schedule ${schedule.id}`,
		);
	return {
		schedule,
		previousPhases: phasesAddedOrRemoved ? null : previousPhases,
		nowSeconds: event.created,
		results: {},
	};
};
