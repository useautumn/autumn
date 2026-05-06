import { z } from "zod/v4";
import { arrayFilter } from "./arrayFilter.js";
import { PlanFilterSchema } from "./planFilter.js";

/**
 * Filter over Autumn customers. Migration-scoped — stable contract
 * decoupled from `ApiCustomerV5`.
 *
 * `plan` is array-navigation: a bare `PlanFilter` is implicit `$some`.
 * Use `{ $every: ... }` or `{ $none: ... }` for stricter checks.
 */
export const CustomerFilterSchema = z.object({
	plan: arrayFilter(PlanFilterSchema).optional(),
});

export type CustomerFilter = z.infer<typeof CustomerFilterSchema>;

export const DEFAULT_CUSTOMER_FILTER: CustomerFilter = {};
