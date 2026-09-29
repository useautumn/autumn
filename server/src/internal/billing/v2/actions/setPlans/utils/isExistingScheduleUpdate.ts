import type { MultiAttachBillingContext } from "@autumn/shared";

type ExistingScheduleContext = Pick<
	MultiAttachBillingContext,
	"fullCustomer" | "stripeSubscription" | "stripeSubscriptionSchedule"
>;

/**
 * The request replaces a schedule already in place rather than creating one.
 * Schedule ids on rows only count while their subscription is live; after a
 * cancel they are stale.
 */
export const isExistingScheduleUpdate = ({
	billingContext,
}: {
	billingContext: ExistingScheduleContext;
}) =>
	!!billingContext.stripeSubscriptionSchedule ||
	(!!billingContext.stripeSubscription &&
		billingContext.fullCustomer.customer_products.some(
			(customerProduct) => (customerProduct.scheduled_ids?.length ?? 0) > 0,
		));
