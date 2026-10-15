import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency";
import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import type { StripeScheduleReleasedContext } from "../stripeScheduleReleasedContext.js";

/**
 * Releasing a schedule leaves the subscription running on its current items
 * indefinitely, so any phase end and future phase Autumn imported from it are
 * stale. Autumn-managed schedules are left alone: restore rebuilds those.
 * Releases Autumn makes itself are left alone too, even of a schedule it
 * imported: the action that released it (set_plans swapping the schedule for
 * its own) already decided those rows.
 */
export const detachReleasedSchedulePhases = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeScheduleReleasedContext;
}) => {
	const { logger, fullCustomer, stripeEvent } = ctx;
	const { schedule } = eventContext;

	if (isAutumnManagedStripeSchedule({ schedule })) {
		logger.info(`[schedule.released] skipping ${schedule.id}: autumn-managed`);
		return;
	}
	if (isAutumnOriginatedStripeEvent({ event: stripeEvent })) {
		logger.info(
			`[schedule.released] skipping ${schedule.id}: released by Autumn`,
		);
		return;
	}
	if (!fullCustomer) return;

	const { detachedCount, clearedCount } =
		await customerProductActions.detachSchedulePhases({
			ctx,
			fullCustomer,
			schedule,
		});
	eventContext.results.detachedSchedulePhases = { detachedCount, clearedCount };

	logger.info(
		`[schedule.released] ${schedule.id}: detached ${detachedCount} scheduled plan(s), cleared ${clearedCount} phase end(s)`,
	);
};
