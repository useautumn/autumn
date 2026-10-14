import { isAutumnManagedStripeSchedule } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import type { StripeScheduleReleasedContext } from "../stripeScheduleReleasedContext.js";

export const detachReleasedSchedulePhases = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeScheduleReleasedContext;
}) => {
	const { logger, fullCustomer } = ctx;
	const { schedule } = eventContext;

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
	eventContext.results.detachedSchedulePhases = { detachedCount, clearedCount };

	logger.info(
		`[schedule.released] ${schedule.id}: detached ${detachedCount} scheduled plan(s), cleared ${clearedCount} phase end(s)`,
	);
};
