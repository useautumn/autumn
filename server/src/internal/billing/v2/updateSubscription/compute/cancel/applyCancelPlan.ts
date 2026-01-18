import type { FullCusProduct } from "@autumn/shared";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { CancelUpdates } from "./computeCancelUpdates";

/**
 * Applies the computed cancel values to the billing plan.
 * - Applies cancelUpdates to inserted products (if custom plan) or existing product
 * - Adds default product to insert list
 * - Sets product to delete
 */
export const applyCancelPlan = ({
	plan,
	cancelUpdates,
	defaultCustomerProduct,
	productToDelete,
}: {
	plan: AutumnBillingPlan;
	cancelUpdates: CancelUpdates;
	defaultCustomerProduct: FullCusProduct | undefined;
	productToDelete: FullCusProduct | undefined;
}): AutumnBillingPlan => {
	// If we're inserting new customer products (custom plan), update THEM with cancel fields
	if (plan.insertCustomerProducts.length > 0) {
		plan.insertCustomerProducts = plan.insertCustomerProducts.map(
			(customerProduct) => ({
				...customerProduct,
				canceled: cancelUpdates.canceled,
				canceled_at: cancelUpdates.canceled_at,
				ended_at: cancelUpdates.ended_at,
				...(cancelUpdates.status && { status: cancelUpdates.status }),
			}),
		);
	} else {
		// Otherwise, update the existing customer product
		plan.updateCustomerProduct.updates = {
			...plan.updateCustomerProduct.updates,
			canceled: cancelUpdates.canceled,
			canceled_at: cancelUpdates.canceled_at,
			ended_at: cancelUpdates.ended_at,
			...(cancelUpdates.status && { status: cancelUpdates.status }),
		};
	}

	// Add default customer product to insert list if available
	if (defaultCustomerProduct) {
		plan.insertCustomerProducts.push(defaultCustomerProduct);
	}

	// Set product to delete if there's an existing scheduled product
	if (productToDelete) {
		plan.deleteCustomerProduct = productToDelete;
	}

	return plan;
};
