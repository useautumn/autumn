import {
	cp,
	hasCustomerProductStarted,
	isCustomerProductFree,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Activates scheduled customer products that should now be active.
 *
 * Filters by:
 * 1. hasCustomerProductStarted (scheduled + starts_at reached)
 * 2. canActivate (free OR on this subscription OR on this schedule)
 *
 * For free products: uses empty subscription/schedule IDs
 * For paid products: uses IDs from stripeSubscription
 */
export const activateScheduledCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { fullCustomer, stripeSubscription, nowMs } = eventContext;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	for (const customerProduct of fullCustomer.customer_products) {
		// Check if can activate: free OR on this subscription OR on this schedule
		const hasStarted = hasCustomerProductStarted(customerProduct, { nowMs });
		const canActivate = cp(customerProduct)
			.free()
			.or.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id })
			.or.onStripeSchedule({
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule?.id ?? "",
			}).valid;

		addToExtraLogs({
			ctx,
			extras: {
				[Date.now().toString()]: {
					product: customerProduct.product.name,
					canActivate,
					hasStarted,
				},
			},
		});

		if (!canActivate || !hasStarted) continue;

		const isFree = isCustomerProductFree(customerProduct);

		logger.info(
			`Activating scheduled product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		// Free products get empty IDs, paid products get IDs from stripe subscription
		const subscriptionIds = isFree ? [] : [stripeSubscription.id];
		const scheduledIds = isFree
			? []
			: stripeSubscriptionSchedule &&
					isCustomerProductOnStripeSubscriptionSchedule({
						customerProduct,
						stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
					})
				? [stripeSubscriptionSchedule.id]
				: [];

		const { updates } = await customerProductActions.activateScheduled({
			ctx,
			customerProduct,
			fullCustomer,
			subscriptionIds,
			scheduledIds,
		});

		trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});
	}
};
