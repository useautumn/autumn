import type { FullCusProduct } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { planFilterMatchesCustomerProduct } from "@autumn/shared/api/products/utils/match/index.js";

export const filterCustomerProductsByPlanFilter = ({
	customerProducts,
	planFilter,
	requireLiteralPlanIdErrorMessage,
}: {
	customerProducts: FullCusProduct[];
	planFilter: PlanFilter;
	requireLiteralPlanIdErrorMessage?: string;
}): {
	customerProducts: FullCusProduct[];
	planId?: string;
} => {
	const planId =
		typeof planFilter.plan_id === "string" ? planFilter.plan_id : undefined;
	if (requireLiteralPlanIdErrorMessage && !planId) {
		throw new Error(requireLiteralPlanIdErrorMessage);
	}

	const matchedCustomerProducts = [];
	for (const customerProduct of customerProducts) {
		if (
			planFilterMatchesCustomerProduct({
				filter: planFilter,
				cusProduct: customerProduct,
			})
		) {
			matchedCustomerProducts.push(customerProduct);
		}
	}

	return { customerProducts: matchedCustomerProducts, planId };
};
