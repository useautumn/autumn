import {
	type AttachBillingContext,
	ErrCode,
	isCustomerProductPaid,
	RecaseError,
} from "@autumn/shared";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const {
		currentCustomerProduct,
		attachProduct,
		stripeSubscription,
		skipBillingChanges,
		skipExternalPSPGuard,
		canceledStripeSubscriptionId,
	} = billingContext;

	if (currentCustomerProduct?.product.id === attachProduct.id) {
		throw new RecaseError({
			code: ErrCode.PlanAlreadyAttached,
			message: `Cannot attach because the customer's current product '${currentCustomerProduct.product.name}' is the same as the product being attached`,
			statusCode: 409,
		});
	}

	if (
		!skipBillingChanges &&
		!skipExternalPSPGuard &&
		!canceledStripeSubscriptionId &&
		!isCustomerProductAutumnManagedTrial(currentCustomerProduct) &&
		isCustomerProductPaid(currentCustomerProduct) &&
		!stripeSubscription
	) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${currentCustomerProduct?.product.name}' is paid but no stripe subscription is linked to it`,
		});
	}
};
