import {
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { carriesReleasedPhaseEnd } from "./carriesReleasedPhaseEnd.js";

/** A released schedule hands its subscription back under released_subscription. */
const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	schedule.released_subscription ??
	(typeof schedule.subscription === "string"
		? schedule.subscription
		: schedule.subscription?.id);

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

	const managed = isAutumnManagedSubscriptionMetadata({
		metadata: schedule.metadata,
		requireRecent: false,
	});
	if (managed.skip) {
		logger.info(
			`[schedule.released] skipping ${schedule.id}: ${managed.reason}`,
		);
		return;
	}
	if (!fullCustomer) return;

	const linked = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: scheduleSubscriptionId(schedule),
	});
	const scheduledOnRelease = fullCustomer.customer_products.filter(
		(customerProduct) =>
			isCustomerProductScheduled(customerProduct) &&
			customerProduct.scheduled_ids?.includes(schedule.id),
	);
	const endingOnRelease = linked.filter((customerProduct) =>
		carriesReleasedPhaseEnd({ customerProduct, schedule }),
	);

	for (const customerProduct of scheduledOnRelease) {
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}
	for (const customerProduct of endingOnRelease) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { ended_at: null, scheduled_ids: [] },
		});
	}

	logger.info(
		`[schedule.released] ${schedule.id}: dropped ${scheduledOnRelease.length} scheduled plan(s), cleared ${endingOnRelease.length} phase end(s)`,
	);
};
