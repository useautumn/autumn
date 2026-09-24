import {
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type Stripe from "stripe";
import { logAutoSyncSkip } from "@/internal/billing/v2/actions/sync/utils/logAutoSyncSkip";
import { isQuantityOnlySchedule } from "@/internal/billing/v2/actions/verify/evaluate/isQuantityOnlySchedule";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import { carriesReleasedPhaseEnd } from "../../handleStripeSubscriptionScheduleReleased/carriesReleasedPhaseEnd.js";

const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	typeof schedule.subscription === "string"
		? schedule.subscription
		: schedule.subscription?.id;

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

	const held = fullCustomer.customer_products.filter(
		(customerProduct) =>
			isCustomerProductScheduled(customerProduct) &&
			customerProduct.scheduled_ids?.includes(schedule.id),
	);
	if (held.length === 0) return;

	const subscriptionId = scheduleSubscriptionId(schedule) ?? null;
	if (!isQuantityOnlySchedule({ schedule })) {
		logAutoSyncSkip({
			logger,
			source: "schedule.updated",
			stripeSubscriptionId: subscriptionId,
			stripeScheduleId: schedule.id,
			reason: "future_phase_edited",
			details: `${held.length} held scheduled plan(s) no longer match the schedule's future phase`,
		});
		return;
	}

	const endingOnPhase = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: subscriptionId ?? undefined,
	}).filter((customerProduct) =>
		carriesReleasedPhaseEnd({ customerProduct, schedule }),
	);

	for (const customerProduct of held) {
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}
	for (const customerProduct of endingOnPhase) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { ended_at: null, scheduled_ids: [] },
		});
	}

	logger.info(
		`[handleStripeSubscriptionScheduleUpdated] ${schedule.id}: future phase edited on a quantity-only schedule, dropped ${held.length} held plan(s), cleared ${endingOnPhase.length} phase end(s)`,
	);
};
