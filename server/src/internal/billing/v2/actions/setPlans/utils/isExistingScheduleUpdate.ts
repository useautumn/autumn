import type {
	MultiAttachBillingContext,
	StripeSubscriptionScope,
} from "@autumn/shared";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

type ExistingScheduleContext = Pick<
	MultiAttachBillingContext,
	"fullCustomer" | "stripeSubscription" | "stripeSubscriptionSchedule"
> & { stripeSubscriptionScope?: StripeSubscriptionScope };

/** Schedule ids on rows only count while their subscription is live. */
export const isExistingScheduleUpdate = ({
	billingContext,
}: {
	billingContext: ExistingScheduleContext;
}) =>
	!!billingContext.stripeSubscriptionSchedule ||
	(!!billingContext.stripeSubscription &&
		filterCustomerProductsInStripeSubscriptionScope({
			stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
			customerProducts: billingContext.fullCustomer.customer_products,
		}).some(
			(customerProduct) => (customerProduct.scheduled_ids?.length ?? 0) > 0,
		));
