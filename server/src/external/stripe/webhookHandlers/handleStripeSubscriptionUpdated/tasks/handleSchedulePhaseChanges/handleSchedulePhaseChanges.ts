import { formatMs } from "@autumn/shared";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";
import { addBillingChangeTag } from "../../../common";
import { isSchedulePhaseChange } from "../../isSchedulePhaseChange";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { activateScheduledCustomerProducts } from "./activateScheduledCustomerProducts";
import { expireEndedCustomerProducts } from "./expireEndedCustomerProducts";
import { releaseScheduleIfLastPhase } from "./releaseScheduleIfLastPhase";

export const handleSchedulePhaseChanges = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { stripeSubscription, nowMs } = eventContext;
	const { logger } = ctx;

	if (isAutumnOriginatedStripeEvent({ event: ctx.stripeEvent })) {
		logger.info(
			`[handleSchedulePhaseChanges] SKIP: autumn-originated subscription update`,
		);
		return;
	}

	const updatesBefore = eventContext.updatedCustomerProducts.length;
	const insertsBefore = eventContext.insertedCustomerProducts.length;

	await activateScheduledCustomerProducts({ ctx, eventContext });

	if (!isSchedulePhaseChange({ subscriptionUpdatedContext: eventContext })) {
		return;
	}

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	logger.info(
		`[handleSchedulePhaseChanges] sub: ${stripeSubscription.id}, now: ${formatMs(nowMs)}, currentPhase: ${currentPhaseIndex + 1}/${stripeSubscriptionSchedule.phases.length}`,
	);

	await expireEndedCustomerProducts({ ctx, eventContext });

	await releaseScheduleIfLastPhase({ ctx, eventContext });

	if (
		eventContext.updatedCustomerProducts.length > updatesBefore ||
		eventContext.insertedCustomerProducts.length > insertsBefore
	) {
		addBillingChangeTag(eventContext, "phase_changed");

		await reconcileLicenseStateForCustomer({
			ctx,
			idOrInternalId: eventContext.fullCustomer.internal_id,
			deleteCache: true,
		});
	}
};
