import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

/**
 * The plan's customer products before and after it runs, the same rows the
 * preview's `incoming` and `outgoing` are built from.
 */
export const billingPlanToChangedCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): { after: FullCusProduct[]; before: FullCusProduct[] } => {
	const updates = getUpdateCustomerProducts({ autumnBillingPlan });
	const patches = getPatchCustomerProducts({ autumnBillingPlan });

	const updatedCustomerProducts = updates.map(
		({ customerProduct, updates }) => {
			const patch = patches.find(
				(candidate) => candidate.customerProduct.id === customerProduct.id,
			);
			const patchedCustomerProduct = patch
				? applyCustomerProductPatch({ customerProduct, patch })
				: customerProduct;
			return applyCustomerProductUpdate({
				customerProduct: patchedCustomerProduct,
				updates,
			});
		},
	);

	return {
		after: [
			...autumnBillingPlan.insertCustomerProducts,
			...updatedCustomerProducts,
		],
		before: updates.map(({ customerProduct }) => customerProduct),
	};
};
