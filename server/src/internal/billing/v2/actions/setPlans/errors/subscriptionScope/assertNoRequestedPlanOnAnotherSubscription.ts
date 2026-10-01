import {
	type CreateScheduleBillingContext,
	ErrCode,
	isOneOffProduct,
	RecaseError,
} from "@autumn/shared";
import {
	describeCustomerProductBilling,
	outOfScopeLiveCustomerProducts,
} from "./outOfScopeLiveCustomerProducts";
import { requestedPlans } from "./requestedPlans";

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

		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `${fullProduct.name} is already billed ${describeCustomerProductBilling(billedElsewhere)}, so it can't be edited from subscription ${stripeSubscriptionScope.stripeSubscriptionId}.`,
			statusCode: 400,
		});
	}
};
