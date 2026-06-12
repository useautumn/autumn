import { z } from "zod/v4";
import { arrayFilter } from "./arrayFilter.js";
import { StringMatcherSchema } from "./matcher.js";
import { PlanFilterSchema } from "./planFilter.js";
import { PlanItemFilterSchema } from "./planItemFilter.js";

/**
 * Filter over Autumn customers. Migration-scoped — stable contract
 * decoupled from `ApiCustomerV5`.
 *
 * `plan` and `item` are array-navigation: a bare filter is implicit `$some`.
 * Use `{ $every: ... }` or `{ $none: ... }` for stricter checks.
 *
 * `item` is sugar for `plan: { item: ... }` — matches customers with at
 * least one active plan that has at least one matching item. Sibling with
 * `plan` it AND's (each must independently have a match).
 *
 * `$and` / `$or` compose independent customer-level predicates: each branch
 * is its own `CustomerFilter` (typically a single `plan` quantifier), so
 * `$and: [{ plan: free }, { plan: pro }]` means "has free AND also has pro"
 * — two separate existence checks, not one plan that is both.
 */
type PlanFilterValue = z.infer<typeof PlanFilterSchema>;
type PlanItemFilterValue = z.infer<typeof PlanItemFilterSchema>;

export type CustomerFilter = {
	customer_id?: z.infer<typeof StringMatcherSchema>;
	plan?:
		| PlanFilterValue
		| {
				$some?: PlanFilterValue;
				$every?: PlanFilterValue;
				$none?: PlanFilterValue;
		  };
	item?:
		| PlanItemFilterValue
		| {
				$some?: PlanItemFilterValue;
				$every?: PlanItemFilterValue;
				$none?: PlanItemFilterValue;
		  };
	$and?: CustomerFilter[];
	$or?: CustomerFilter[];
};

export const CustomerFilterSchema: z.ZodType<CustomerFilter> = z.lazy(() =>
	z.object({
		customer_id: StringMatcherSchema.optional(),
		plan: arrayFilter(PlanFilterSchema).optional(),
		item: arrayFilter(PlanItemFilterSchema).optional(),
		$and: z.array(CustomerFilterSchema).min(1).optional(),
		$or: z.array(CustomerFilterSchema).min(1).optional(),
	}),
);

export const DEFAULT_CUSTOMER_FILTER: CustomerFilter = {};
