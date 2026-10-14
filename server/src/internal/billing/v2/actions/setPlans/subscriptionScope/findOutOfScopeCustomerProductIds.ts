import type { CreateScheduleBillingContext } from "@autumn/shared";
import { isCustomerProductInStripeSubscriptionScope } from "./isCustomerProductInStripeSubscriptionScope";

export const findOutOfScopeCustomerProductIds = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"fullCustomer" | "stripeSubscriptionScope"
	>;
}): string[] =>
	billingContext.fullCustomer.customer_products
		.filter(
			(customerProduct) =>
				!isCustomerProductInStripeSubscriptionScope({
					stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
					customerProduct,
				}),
		)
		.map(({ id }) => id);
