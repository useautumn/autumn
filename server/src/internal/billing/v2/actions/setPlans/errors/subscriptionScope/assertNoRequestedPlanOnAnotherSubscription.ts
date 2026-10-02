import {
	type CreateScheduleBillingContext,
	isOneOffProduct,
} from "@autumn/shared";
import { outOfScopeLiveCustomerProducts } from "./outOfScopeLiveCustomerProducts";
import { requestedPlans } from "./requestedPlans";
import { subscriptionConflictError } from "./subscriptionScopeErrors";

/** A plan billed elsewhere can only be edited from its own subscription. */
export const assertNoRequestedPlanOnAnotherSubscription = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { stripeSubscriptionScope } = billingContext;
	if (!stripeSubscriptionScope) return;

	for (const { fullProduct, internalEntityId } of requestedPlans({
		billingContext,
	})) {
		if (isOneOffProduct({ product: fullProduct })) continue;

		const billedElsewhere = outOfScopeLiveCustomerProducts({
			billingContext,
			internalEntityId,
		}).find(({ product }) => product.id === fullProduct.id);
		if (!billedElsewhere) continue;

		throw subscriptionConflictError({
			customerProducts: billingContext.fullCustomer.customer_products,
			conflict: "already_billed",
			requestedPlanName: fullProduct.name,
			conflictingCustomerProduct: billedElsewhere,
		});
	}
};
