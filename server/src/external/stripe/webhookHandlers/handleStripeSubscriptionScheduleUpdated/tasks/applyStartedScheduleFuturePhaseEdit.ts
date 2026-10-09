import { stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";
import { logAutoSyncSkip } from "@/internal/billing/v2/actions/sync/utils/logAutoSyncSkip";
import { isQuantityOnlySchedule } from "@/internal/billing/v2/actions/verify/evaluate/isQuantityOnlySchedule";
import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { computeDetachSchedulePhases } from "@/internal/customers/cusProducts/actions/detachSchedulePhases/computeDetachSchedulePhases";
import { executeDetachSchedulePhases } from "@/internal/customers/cusProducts/actions/detachSchedulePhases/executeDetachSchedulePhases";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import { futurePhaseItemsChanged } from "../futurePhaseItemsChanged.js";
import type { StripeScheduleUpdatedContext } from "../setupScheduleUpdatedContext.js";

const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	stripeRefToId(schedule.subscription) ?? null;

/**
 * A scheduled row carries the future phase as it was at import. Once the phase
 * is edited in Stripe that row is stale: a quantity-only step is detached (the
 * subscription webhook applies it when the phase turns); anything else is
 * warned about, since Autumn cannot rebuild the phase from the event alone.
 */
export const applyStartedScheduleFuturePhaseEdit = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeScheduleUpdatedContext;
}) => {
	const { logger, fullCustomer } = ctx;
	const { schedule, previousPhases, nowSeconds } = eventContext;
	if (schedule.status !== "active" || !previousPhases || !fullCustomer) return;
	if (isAutumnManagedStripeSchedule({ schedule })) return;
	const changed = futurePhaseItemsChanged({
		previousPhases,
		currentPhases: schedule.phases,
		nowSeconds,
	});
	if (!changed) return;

	const rows = computeDetachSchedulePhases({ fullCustomer, schedule });
	if (rows.scheduledRows.length === 0) return;

	if (!isQuantityOnlySchedule({ schedule })) {
		logAutoSyncSkip({
			logger,
			source: "schedule.updated",
			stripeSubscriptionId: scheduleSubscriptionId(schedule),
			stripeScheduleId: schedule.id,
			reason: "future_phase_edited",
			details: `${rows.scheduledRows.length} scheduled plan(s) no longer match the schedule's future phase`,
		});
		return;
	}

	const { detachedCount, clearedCount } = await executeDetachSchedulePhases({
		ctx,
		rows,
	});
	eventContext.results.detachedFuturePhases = { detachedCount, clearedCount };
	logger.info(
		`[handleStripeSubscriptionScheduleUpdated] ${schedule.id}: future phase edited on a quantity-only schedule, detached ${detachedCount} scheduled plan(s), cleared ${clearedCount} phase end(s)`,
	);
};
