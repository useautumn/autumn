import {
	type CreateScheduleBillingContext,
	isCustomerProductMain,
	isOneOffProduct,
} from "@autumn/shared";
import {
	outOfScopeLiveCustomerProducts,
	subscriptionConflictError,
} from "./outOfScopeLiveCustomerProducts";
import { requestedPlans } from "./requestedPlans";

/** A main plan would replace its group's live plan, which can't move between subscriptions. */
export const assertNoMainPlanGroupOnAnotherSubscription = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { stripeSubscriptionScope } = billingContext;
	if (!stripeSubscriptionScope) return;

	for (const { fullProduct, internalEntityId } of requestedPlans({
		billingContext,
	})) {
		if (fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })) {
			continue;
		}

		const groupPlanElsewhere = outOfScopeLiveCustomerProducts({
			billingContext,
			internalEntityId,
		}).find(
			(customerProduct) =>
				isCustomerProductMain(customerProduct) &&
				(customerProduct.product.group ?? "") === (fullProduct.group ?? ""),
		);
		if (!groupPlanElsewhere) continue;

		throw subscriptionConflictError({
			billingContext,
			conflict: "replaces",
			requestedPlanName: fullProduct.name,
			conflictingCustomerProduct: groupPlanElsewhere,
		});
	}
};
