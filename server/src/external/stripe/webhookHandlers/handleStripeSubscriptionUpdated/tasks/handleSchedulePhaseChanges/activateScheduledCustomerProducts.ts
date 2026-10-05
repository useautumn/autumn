import {
	cp,
	hasCustomerProductStarted,
	isCustomerProductFree,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { ALLOCATIONS_ADJUSTED_TAG } from "@/internal/balances/allocate/allocationsAdjustedTag";
import { isFreePhasePlaceholderCustomerProduct } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isFreePhasePlaceholderCustomerProduct";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { addBillingChangeTag } from "../../../common/billingChangeTags";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Activates scheduled customer products that should now be active.
 *
 * Filters by:
 * 1. hasCustomerProductStarted (scheduled + starts_at reached)
 * 2. canActivate (free OR on this subscription OR on this schedule)
 *
 * For free products: uses empty subscription/schedule IDs, unless they ride a $0 placeholder
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

		logger.info(
			`Activating scheduled product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const scheduleId =
			stripeSubscriptionSchedule &&
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			})
				? stripeSubscriptionSchedule.id
				: undefined;
		// A free plan riding the $0 placeholder ends when this subscription is canceled.
		const staysOnSubscription =
			!isCustomerProductFree(customerProduct) ||
			(!!scheduleId && isFreePhasePlaceholderCustomerProduct(customerProduct));

		const subscriptionIds = staysOnSubscription ? [stripeSubscription.id] : [];
		const scheduledIds = staysOnSubscription && scheduleId ? [scheduleId] : [];

		const { updates, allocationsAdjusted } =
			await customerProductActions.activateScheduled({
				ctx,
				customerProduct,
				fullCustomer,
				subscriptionIds,
				scheduledIds,
				activatedAt: nowMs,
				emitsBillingUpdated: true,
			});
		if (allocationsAdjusted)
			addBillingChangeTag(eventContext, ALLOCATIONS_ADJUSTED_TAG);

		trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});
	}
};
