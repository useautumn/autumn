import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import {
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	isCustomerProductUnlinkedFree,
} from "../classifyCustomerProduct/classifyCustomerProduct";

/** The plans editing one Stripe subscription covers: those billed on it or its
 * schedule, plus the customer-wide free plans. */
export const filterCustomerProductsByStripeSubscriptionScope = ({
	customerProducts,
	stripeSubscriptionId,
	stripeScheduleId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
}): FullCusProduct[] =>
	customerProducts.filter(
		(customerProduct) =>
			(stripeSubscriptionId &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId,
				})) ||
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripeScheduleId ?? undefined,
			}) ||
			isCustomerProductUnlinkedFree(customerProduct),
	);
