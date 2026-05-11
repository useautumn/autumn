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
 */
export const CustomerFilterSchema = z.object({
	customer_id: StringMatcherSchema.optional(),
	plan: arrayFilter(PlanFilterSchema).optional(),
	item: arrayFilter(PlanItemFilterSchema).optional(),
});

export type CustomerFilter = z.infer<typeof CustomerFilterSchema>;

export const DEFAULT_CUSTOMER_FILTER: CustomerFilter = {};
