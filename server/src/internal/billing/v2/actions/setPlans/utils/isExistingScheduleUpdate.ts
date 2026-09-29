import type { MultiAttachBillingContext } from "@autumn/shared";

type ExistingScheduleContext = Pick<
	MultiAttachBillingContext,
	"fullCustomer" | "stripeSubscription" | "stripeSubscriptionSchedule"
>;

/** Schedule ids on rows only count while their subscription is live. */
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
