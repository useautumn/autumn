import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	type FullCusProduct,
	isCusProductOnEntity,
} from "@autumn/shared";
import { isCustomerProductInStripeSubscriptionScope } from "../../subscriptionScope/isCustomerProductInStripeSubscriptionScope";

/** Live plans on the plan's entity that the targeted subscription doesn't cover. */
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

export const describeCustomerProductBilling = (
	customerProduct: FullCusProduct,
) => {
	const [stripeSubscriptionId] = customerProduct.subscription_ids ?? [];
	return stripeSubscriptionId
		? `on subscription ${stripeSubscriptionId}`
		: "outside any Stripe subscription";
};
