import { z } from "zod/v4";
import { arrayFilter } from "./arrayFilter.js";
import {
	BooleanMatcherSchema,
	nullableObjectFilter,
	NumberMatcherSchema,
	StringMatcherSchema,
} from "./matcher.js";
import { PlanItemFilterSchema } from "./planItemFilter.js";

/**
 * Filter over a plan. Migration-scoped: stable contract decoupled from
 * `ApiPlanV1`.
 *
 * Customer-rooted filters automatically scope to relevant customer-product
 * status (`cp.status IN RELEVANT_STATUSES`).
 *
 * `price` is the plan's BASE price (customer_price linked to a price with
 * `entitlement_id IS NULL`). Use `price: null` for free plans,
 * `price: { $ne: null }` for paid plans.
 *
 * `paid` / `recurring` are DERIVED filters — boolean shortcuts that
 * compile to EXISTS expressions:
 *  - `paid: true`     → has at least one customer_price (base or item)
 *  - `recurring: true`→ has at least one customer_price whose price's
 *                       interval is not 'one_off'
 *  - `addon: false`   → product.is_add_on is false
 *
 * Note: `recurring: true` is a strict subset of `paid: true`. Every
 * recurring plan is paid (a recurring price is still a price), but a
 * paid plan may be one-off. Combine them only when you mean it — e.g.
 * `paid: true, recurring: false` selects one-off-paid plans.
 *
 * `item` is array-navigation: a bare `PlanItemFilter` is implicit `$some`.
 *
 * `$or` joins sibling filters with OR instead of the default AND. Sibling
 * fields outside `$or` continue to be ANDed with the OR group.
 */

const PlanPriceFilterInner = z.object({});

export type PlanFilter = {
	plan_id?: z.infer<typeof StringMatcherSchema>;
	/** Mirrors `products.version`. */
	version?: z.infer<typeof NumberMatcherSchema>;
	price?:
		| null
		| { $eq?: null; $ne?: null }
		| z.infer<typeof PlanPriceFilterInner>;
	addon?: z.infer<typeof BooleanMatcherSchema>;
	/** `recurring: true` already implies a paid plan. */
	paid?: z.infer<typeof BooleanMatcherSchema>;
	recurring?: z.infer<typeof BooleanMatcherSchema>;
	/** Mirrors `customer_products.custom`. Migrations that bump a plan
	 *  version inject `custom: false` automatically (see
	 *  `preProcessMigrationOperations`) so admin-customized plans are never
	 *  touched. Set explicitly to override. */
	custom?: z.infer<typeof BooleanMatcherSchema>;
	item?:
		| z.infer<typeof PlanItemFilterSchema>
		| {
				$some?: z.infer<typeof PlanItemFilterSchema>;
				$every?: z.infer<typeof PlanItemFilterSchema>;
				$none?: z.infer<typeof PlanItemFilterSchema>;
		  };
	$or?: PlanFilter[];
};

export const PlanFilterSchema: z.ZodType<PlanFilter> = z.lazy(() =>
	z.object({
		plan_id: StringMatcherSchema.optional(),
		version: NumberMatcherSchema.optional(),
		price: nullableObjectFilter(PlanPriceFilterInner).optional(),
		addon: BooleanMatcherSchema.optional(),
		paid: BooleanMatcherSchema.optional(),
		recurring: BooleanMatcherSchema.optional(),
		custom: BooleanMatcherSchema.optional(),
		item: arrayFilter(PlanItemFilterSchema).optional(),
		$or: z.array(PlanFilterSchema).optional(),
	}),
);

export const DEFAULT_PLAN_FILTER: PlanFilter = {};
