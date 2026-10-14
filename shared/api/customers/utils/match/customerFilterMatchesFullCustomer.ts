import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import { customerProductHasRelevantStatus } from "../../../../utils/index.js";
import type { CustomerFilter } from "../../../migrations/filters/customerFilter.js";
import {
	arrayFilterMatches,
	stringMatcherMatches,
} from "../../../migrations/filters/match/index.js";
import { planFilterMatchesCustomerProduct } from "../../../products/utils/match/planFilterMatchesCustomerProduct.js";

export const customerFilterMatchesFullCustomer = ({
	filter,
	fullCustomer,
}: {
	filter: CustomerFilter;
	fullCustomer: Pick<FullCustomer, "id" | "customer_products">;
}): boolean => {
	if (
		filter.customer_id !== undefined &&
		!stringMatcherMatches({
			matcher: filter.customer_id,
			value: fullCustomer.id,
		})
	) {
		return false;
	}

	if (filter.plan !== undefined) {
		const relevantProducts = fullCustomer.customer_products.filter(
			customerProductHasRelevantStatus,
		);
		if (
			!arrayFilterMatches({
				filter: filter.plan,
				items: relevantProducts,
				matchesElement: ({ filter: planFilter, item: customerProduct }) =>
					planFilterMatchesCustomerProduct({
						filter: planFilter,
						cusProduct: customerProduct,
					}),
			})
		) {
			return false;
		}
	}

	if (filter.item !== undefined) {
		throw new Error(
			"customerFilterMatchesFullCustomer: filter.item not supported in JS matcher yet",
		);
	}

	return true;
};
