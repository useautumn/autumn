import {
	type CreateScheduleBillingContext,
	ErrCode,
	isCustomerProductMain,
	isOneOffProduct,
	RecaseError,
} from "@autumn/shared";
import {
	describeCustomerProductBilling,
	outOfScopeLiveCustomerProducts,
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

		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `${fullProduct.name} would replace ${groupPlanElsewhere.product.name}, which is billed ${describeCustomerProductBilling(groupPlanElsewhere)}. Plans can't move between subscriptions.`,
			statusCode: 400,
		});
	}
};
