import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { getSchedulePhaseMoves } from "./getSchedulePhaseMoves.js";
import { resyncScheduledCustomerProductStartsAt } from "./tasks/resyncScheduledCustomerProductStartsAt.js";

/**
 * Re-syncs scheduled customerProduct starts_at when a not-yet-started schedule
 * is rescheduled outside Autumn (e.g. Stripe dashboard). Started schedules and
 * phase add/remove are intentionally left alone.
 */
export const handleStripeSubscriptionScheduleUpdated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleUpdatedEvent;
}) => {
	const schedule = event.data.object;
	const previousPhases = event.data.previous_attributes?.phases;

	if (schedule.status !== "not_started") return;
	if (!previousPhases) return;
	if (previousPhases.length !== schedule.phases.length) {
		ctx.logger.warn(
			`[handleStripeSubscriptionScheduleUpdated] skipping structural phase change (${previousPhases.length} -> ${schedule.phases.length} phases) on schedule ${schedule.id}`,
		);
		return;
	}

	const moves = getSchedulePhaseMoves({
		previousPhases,
		currentPhases: schedule.phases,
	});
	if (moves.length === 0) return;

	await resyncScheduledCustomerProductStartsAt({ ctx, schedule, moves });
};
