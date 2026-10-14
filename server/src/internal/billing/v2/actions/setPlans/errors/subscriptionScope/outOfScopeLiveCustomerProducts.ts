import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	isCusProductOnEntity,
} from "@autumn/shared";
import { isCustomerProductInStripeSubscriptionScope } from "../../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

export const outOfScopeLiveCustomerProducts = ({
	billingContext,
	internalEntityId,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"fullCustomer" | "stripeSubscriptionScope"
	>;
	internalEntityId?: string;
}): FullCusProduct[] =>
	billingContext.fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProductHasRelevantStatus(customerProduct) &&
			isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId }) &&
			!isCustomerProductInStripeSubscriptionScope({
				stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
				customerProduct,
			}),
	);
