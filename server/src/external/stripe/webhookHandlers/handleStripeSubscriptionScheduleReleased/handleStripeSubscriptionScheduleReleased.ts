import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

/** A released schedule hands its subscription back under released_subscription. */
const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	schedule.released_subscription ??
	(typeof schedule.subscription === "string"
		? schedule.subscription
		: schedule.subscription?.id);

/** A live plan whose end date came from a phase the released schedule no longer has. */
const carriesReleasedPhaseEnd = (customerProduct: FullCusProduct) =>
	!isCustomerProductScheduled(customerProduct) &&
	!customerProduct.canceled &&
	customerProduct.ended_at != null;

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

	const subscriptionId = scheduleSubscriptionId(schedule);
	const linked = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: subscriptionId,
	});
	const scheduledOnRelease = fullCustomer.customer_products.filter(
		(customerProduct) =>
			isCustomerProductScheduled(customerProduct) &&
			customerProduct.scheduled_ids?.includes(schedule.id),
	);

	for (const customerProduct of scheduledOnRelease) {
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}
	for (const customerProduct of linked.filter(carriesReleasedPhaseEnd)) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { ended_at: null, scheduled_ids: [] },
		});
	}

	logger.info(
		`[schedule.released] ${schedule.id}: dropped ${scheduledOnRelease.length} scheduled plan(s), cleared ${linked.filter(carriesReleasedPhaseEnd).length} phase end(s)`,
	);
};
