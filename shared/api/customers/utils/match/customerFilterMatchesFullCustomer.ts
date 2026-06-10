import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import { customerProductHasRelevantStatus } from "../../../../utils/index.js";
import type { CustomerFilter } from "../../../migrations/filters/customerFilter.js";
import {
	arrayFilterMatches,
	stringMatcherMatches,
} from "../../../migrations/filters/match/index.js";
import { planFilterMatchesCustomerProduct } from "../../../products/utils/match/planFilterMatchesCustomerProduct.js";

/**
 * Predicate: does `filter` match a customer with `customer_products`?
 *
 * JS-side mirror of the SQL compiler's `customerRegistry`. Used by the lazy
 * migration helper to skip non-matching customers without queueing work.
 * Mirrors the `cp.status IN RELEVANT_STATUSES` ambient predicate baked into
 * the SQL plan scope — expired/paused cusProducts are ignored.
 *
 * Supports `customer_id` and `plan` (`$some` / `$every` / `$none` and the
 * implicit-`$some` bare form). `item` sugar throws to make the gap explicit,
 * matching the convention in `planFilterMatchesCustomerProduct`.
 */
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
