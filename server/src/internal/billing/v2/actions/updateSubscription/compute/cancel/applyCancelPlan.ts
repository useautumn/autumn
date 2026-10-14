import type {
	AutumnBillingPlan,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import type { CancelUpdates } from "./computeCancelUpdates";

export const applyCancelPlan = ({
	plan,
	cancelUpdates,
	defaultCustomerProduct,
	productToDelete,
	productsToDelete,
	cancelLineItems,
	existingCustomerProduct,
}: {
	plan: AutumnBillingPlan;
	cancelUpdates: CancelUpdates;
	defaultCustomerProduct: FullCusProduct | undefined;
	productToDelete: FullCusProduct | undefined;
	productsToDelete: FullCusProduct[];
	cancelLineItems: LineItem[];
	existingCustomerProduct: FullCusProduct;
}): AutumnBillingPlan => {
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
		plan.updateCustomerProduct = {
			customerProduct:
				plan.updateCustomerProduct?.customerProduct ?? existingCustomerProduct,

			updates: {
				...plan.updateCustomerProduct?.updates,
				canceled: cancelUpdates.canceled,
				canceled_at: cancelUpdates.canceled_at,
				ended_at: cancelUpdates.ended_at,
				...(cancelUpdates.status && { status: cancelUpdates.status }),
			},
		};
	}

	if (defaultCustomerProduct) {
		plan.insertCustomerProducts.push(defaultCustomerProduct);
	}

	if (productToDelete) {
		plan.deleteCustomerProduct = productToDelete;
	}

	if (productsToDelete.length > 0) {
		plan.deleteCustomerProducts = [
			...(plan.deleteCustomerProducts ?? []),
			...productsToDelete,
		];
	}

	if (cancelLineItems.length > 0) {
		plan.lineItems = [...(plan.lineItems ?? []), ...cancelLineItems];
	}

	return plan;
};
