import type Stripe from "stripe";
import { logAutoSyncSkip } from "@/internal/billing/v2/actions/sync/utils/logAutoSyncSkip";
import { isQuantityOnlySchedule } from "@/internal/billing/v2/actions/verify/evaluate/isQuantityOnlySchedule";
import { computeHeldSchedulePhases } from "@/internal/customers/cusProducts/actions/dropHeldSchedulePhases/computeHeldSchedulePhases";
import { executeDropHeldSchedulePhases } from "@/internal/customers/cusProducts/actions/dropHeldSchedulePhases/executeDropHeldSchedulePhases";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";

const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	typeof schedule.subscription === "string"
		? schedule.subscription
		: (schedule.subscription?.id ?? null);

/**
 * A held scheduled row carries the future phase as it was at import. Once the
 * phase is edited in Stripe that row is stale: a quantity-only step is dropped
 * (the subscription webhook applies it when the phase turns); anything else is
 * warned about, since Autumn cannot rebuild the phase from the event alone.
 */
export const applyStartedScheduleFuturePhaseEdit = async ({
	ctx,
	schedule,
}: {
	ctx: StripeWebhookContext;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const { logger, fullCustomer } = ctx;
	if (!fullCustomer) return;

	const held = computeHeldSchedulePhases({ fullCustomer, schedule });
	if (held.heldRows.length === 0) return;

	if (!isQuantityOnlySchedule({ schedule })) {
		logAutoSyncSkip({
			logger,
			source: "schedule.updated",
			stripeSubscriptionId: scheduleSubscriptionId(schedule),
			stripeScheduleId: schedule.id,
			reason: "future_phase_edited",
			details: `${held.heldRows.length} held scheduled plan(s) no longer match the schedule's future phase`,
		});
		return;
	}

	const { droppedCount, clearedCount } = await executeDropHeldSchedulePhases({
		ctx,
		held,
	});
	logger.info(
		`[handleStripeSubscriptionScheduleUpdated] ${schedule.id}: future phase edited on a quantity-only schedule, dropped ${droppedCount} held plan(s), cleared ${clearedCount} phase end(s)`,
	);
};
