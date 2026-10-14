import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";

export const applyCustomerLicensePlanOps = ({
	customerProducts,
	autumnBillingPlan,
}: {
	customerProducts: FullCusProduct[];
	autumnBillingPlan: AutumnBillingPlan;
}): FullCusProduct[] => {
	const paidQuantityUpdates = (
		autumnBillingPlan.customerLicenseUpdates ?? []
	).filter((update) => update.paidQuantity !== undefined);
	const sameRowTransitions = (
		autumnBillingPlan.customerLicenseTransitions ?? []
	).filter(isSameRowTransition);
	if (paidQuantityUpdates.length === 0 && sameRowTransitions.length === 0) {
		return customerProducts;
	}

	return customerProducts.map((customerProduct) => ({
		...customerProduct,
		customer_licenses: customerProduct.customer_licenses?.map(
			(customerLicense) => {
				const update = paidQuantityUpdates.find(
					(candidate) => candidate.customerLicenseId === customerLicense.id,
				);
				if (update?.paidQuantity !== undefined) {
					return convergeCustomerLicense({
						customerLicense,
						paidQuantity: update.paidQuantity,
					});
				}

				const transition = sameRowTransitions.find(
					(candidate) =>
						candidate.incomingCustomerLicense.id === customerLicense.id,
				);
				const planLicense = transition?.incomingCustomerLicense.planLicense;
				if (!transition || !planLicense) return customerLicense;
				return convergeCustomerLicense({
					customerLicense,
					planLicense,
					paidQuantity: transition.updates.paidQuantity,
				});
			},
		),
	}));
};
