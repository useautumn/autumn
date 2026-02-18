import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { computeCustomerProductToDelete } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCustomerProductToDelete";

/**
 * Applies uncancel updates to an existing billing plan.
 * This merges the uncancel changes (clear cancellation state, delete scheduled product)
 * with any other changes in the plan.
 */
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

	// Find scheduled product to delete (only for main canceling products)
	const deleteCustomerProduct = computeCustomerProductToDelete({
		billingContext,
	});

	// Build the updateCustomerProduct with cancel updates merged in
	// If plan doesn't have updateCustomerProduct, create one targeting the current product
	const existingUpdate = plan.updateCustomerProduct;
	const updateCustomerProduct = {
		customerProduct:
			existingUpdate?.customerProduct ?? billingContext.customerProduct,
		updates: {
			...existingUpdate?.updates,
			...uncancelUpdates,
		},
	};

	// // If there are new customer products being inserted, also add uncancel updates to them
	// const insertCustomerProducts = plan.insertCustomerProducts.map((insert) => ({
	// 	...insert,
	// 	...uncancelUpdates,
	// }));

	return {
		...plan,
		// insertCustomerProducts,
		updateCustomerProduct,
		// Use the plan's deleteCustomerProduct if already set, otherwise use ours
		deleteCustomerProduct: plan.deleteCustomerProduct ?? deleteCustomerProduct,
	};
};
