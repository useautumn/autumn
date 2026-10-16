import type { FullCustomer } from "../../../../models/cusModels/fullCusModel.js";
import { customerProductHasRelevantStatus } from "../../../../utils/index.js";
import {
	arrayFilterMatches,
	stringMatcherMatches,
} from "../../../common/filters/match/index.js";
import type { CustomerFilter } from "../../../migrations/filters/customerFilter.js";
import { planFilterMatchesCustomerProduct } from "../../../products/utils/match/planFilterMatchesCustomerProduct.js";

/**
 * Predicate: does `filter` match a customer with `customer_products`?
 *
 * JS-side mirror of the SQL compiler's `customerRegistry`. Used by the lazy
 * migration helper to skip non-matching customers without queueing work.
 * Mirrors the `cp.status IN RELEVANT_STATUSES` ambient predicate baked into
 * the SQL plan scope — expired/paused cusProducts are ignored.
 *
 * Supports `customer_id`, `plan` (`$some` / `$every` / `$none` and the
 * implicit-`$some` bare form), the `item` sugar, and `$and` / `$or` branches.
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

	const relevantProducts = fullCustomer.customer_products.filter(
		customerProductHasRelevantStatus,
	);
	const plansMatch = ({
		planFilter,
	}: {
		planFilter: NonNullable<CustomerFilter["plan"]>;
	}) =>
		arrayFilterMatches({
			filter: planFilter,
			items: relevantProducts,
			matchesElement: ({ filter: elementFilter, item: customerProduct }) =>
				planFilterMatchesCustomerProduct({
					filter: elementFilter,
					cusProduct: customerProduct,
				}),
		});

	if (filter.plan !== undefined && !plansMatch({ planFilter: filter.plan })) {
		return false;
	}

	// `item` is sugar for `plan: { item }`, as in `parseCustomerFilter`.
	if (
		filter.item !== undefined &&
		!plansMatch({ planFilter: { item: filter.item } })
	) {
		return false;
	}

	const branchMatches = (branch: CustomerFilter) =>
		customerFilterMatchesFullCustomer({ filter: branch, fullCustomer });

	if (filter.$and !== undefined && !filter.$and.every(branchMatches)) {
		return false;
	}

	if (filter.$or !== undefined && !filter.$or.some(branchMatches)) {
		return false;
	}

	return true;
};
