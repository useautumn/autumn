import type { MultiAttachBillingContext } from "@autumn/shared";

type ExistingScheduleContext = Pick<
	MultiAttachBillingContext,
	"fullCustomer" | "stripeSubscriptionSchedule"
>;

/**
 * The request replaces a schedule already in place rather than creating one.
 * Autumn-managed phases have no Stripe schedule, so scheduled customer products
 * count too.
 */
export const isExistingScheduleUpdate = ({
	billingContext,
}: {
	billingContext: ExistingScheduleContext;
}) =>
	!!billingContext.stripeSubscriptionSchedule ||
	billingContext.fullCustomer.customer_products.some(
		(customerProduct) => (customerProduct.scheduled_ids?.length ?? 0) > 0,
	);
