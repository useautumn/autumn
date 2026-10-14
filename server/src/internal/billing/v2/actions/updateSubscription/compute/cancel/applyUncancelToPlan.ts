import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { computeCustomerProductToDelete } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCustomerProductToDelete";

export const applyUncancelToPlan = ({
	billingContext,
	plan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	const { cancelAction } = billingContext;

	if (cancelAction !== "uncancel") return plan;

	const uncancelUpdates = {
		canceled: false,
		canceled_at: null,
		ended_at: null,
	};

	const deleteCustomerProduct = computeCustomerProductToDelete({
		billingContext,
	});

	const existingUpdate = plan.updateCustomerProduct;
	const updateCustomerProduct = {
		customerProduct:
			existingUpdate?.customerProduct ?? billingContext.customerProduct,
		updates: {
			...existingUpdate?.updates,
			...uncancelUpdates,
		},
	};

	return {
		...plan,
		updateCustomerProduct,
		deleteCustomerProduct: plan.deleteCustomerProduct ?? deleteCustomerProduct,
	};
};
