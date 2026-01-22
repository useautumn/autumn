import {
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductCanceling,
	isCustomerProductMain,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

/**
 * Finds the scheduled product to delete when uncanceling.
 * Only applies to main products that are currently canceling.
 */
const findScheduledProductToDelete = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): FullCusProduct | undefined => {
	const { customerProduct, fullCustomer } = billingContext;

	const isMain = isCustomerProductMain(customerProduct);
	const isCanceling = isCustomerProductCanceling(customerProduct);

	if (!isMain || !isCanceling) {
		return undefined;
	}

	return findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: customerProduct.product.group,
	});
};

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
	const { cancelMode } = billingContext;

	if (cancelMode !== "uncancel") {
		return plan;
	}

	const cancelUpdates = {
		canceled: false,
		canceled_at: null,
		ended_at: null,
	};

	// Find scheduled product to delete (only for main canceling products)
	const deleteCustomerProduct = findScheduledProductToDelete({
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
			...cancelUpdates,
		},
	};

	return {
		...plan,
		updateCustomerProduct,
		// Use the plan's deleteCustomerProduct if already set, otherwise use ours
		deleteCustomerProduct: plan.deleteCustomerProduct ?? deleteCustomerProduct,
	};
};
