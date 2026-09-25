import type Stripe from "stripe";
import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

/**
 * Releasing a schedule leaves the subscription running on its current items
 * indefinitely, so any phase end and future phase Autumn imported from it are
 * stale. Autumn-managed schedules are left alone: restore rebuilds those.
 */
export const handleStripeSubscriptionScheduleReleased = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleReleasedEvent;
}) => {
	const { logger, fullCustomer } = ctx;
	const schedule = event.data.object;

	if (isAutumnManagedStripeSchedule({ schedule })) {
		logger.info(`[schedule.released] skipping ${schedule.id}: autumn-managed`);
		return;
	}
	if (!fullCustomer) return;

	const { detachedCount, clearedCount } =
		await customerProductActions.detachSchedulePhases({
			ctx,
			fullCustomer,
			schedule,
		});

	logger.info(
		`[schedule.released] ${schedule.id}: detached ${detachedCount} scheduled plan(s), cleared ${clearedCount} phase end(s)`,
	);
};
