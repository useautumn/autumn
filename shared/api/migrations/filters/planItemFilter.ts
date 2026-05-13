import { z } from "zod/v4";
import {
	BooleanMatcherSchema,
	enumMatcher,
	nullableObjectFilter,
	StringMatcherSchema,
} from "./matcher.js";

/**
 * Filter over plan items (the unified price + entitlement view of a feature
 * within a plan). Migration-scoped: a stable contract decoupled from the
 * public API schema so plan-side changes don't break existing migrations.
 *
 * Use `price: null` for "free" items (entitlement-only) and
 * `price: { $ne: null }` for paid items.
 */

const BillingMethodSchema = enumMatcher(["prepaid", "usage_based"]);

const PriceFilterInner = z.object({
	billing_method: BillingMethodSchema.optional(),
});

const RolloverFilterInner = z.object({});

export const PlanItemFilterSchema = z.object({
	feature_id: StringMatcherSchema.optional(),
	unlimited: BooleanMatcherSchema.optional(),
	price: nullableObjectFilter(PriceFilterInner).optional(),
	rollover: nullableObjectFilter(RolloverFilterInner).optional(),
});

export type PlanItemFilter = z.infer<typeof PlanItemFilterSchema>;

export const DEFAULT_PLAN_ITEM_FILTER: PlanItemFilter = {};
