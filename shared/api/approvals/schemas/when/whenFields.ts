import { z } from "zod/v4";
import { arrayFilter } from "../../../common/filters/arrayFilter";
import {
	NumberMatcherSchema,
	nullableObjectFilter,
	StringMatcherSchema,
} from "../../../common/filters/matcher";
import { CustomerFilterSchema } from "../../../migrations/filters/customerFilter";
import { PlanFilterSchema } from "../../../migrations/filters/planFilter";

/** Quantifiers an array filter must use explicitly in a rule. */
export const ARRAY_QUANTIFIERS = ["$some", "$every", "$none"];

/** Ids accept the string matcher shape; the validator rejects patterns on them. */
export const IdMatcherSchema = StringMatcherSchema;

/** Money in the org's default currency, major units. */
export const MoneyMatcherSchema = NumberMatcherSchema;

/** A date relative to when the rule is checked: `{ days_from_now: -7 }` is a week ago. */
export const RelativeDateSchema = z.object({ days_from_now: z.number() });

export const RelativeDateMatcherSchema = z.union([
	z.null(),
	z.object({
		$gt: RelativeDateSchema.optional(),
		$gte: RelativeDateSchema.optional(),
		$lt: RelativeDateSchema.optional(),
		$lte: RelativeDateSchema.optional(),
	}),
]);

export type RelativeDateMatcher = z.infer<typeof RelativeDateMatcherSchema>;

/**
 * Fields more than one `when` shape has. Shapes must reuse these instances:
 * rules mixing actions only get the fields whose schemas are identical.
 */
export const sharedWhenFields = {
	customer: CustomerFilterSchema.optional(),
	outgoing: arrayFilter(PlanFilterSchema).optional(),
	feature_id: IdMatcherSchema.optional(),
	included_grant: NumberMatcherSchema.optional(),
	refund: nullableObjectFilter(
		z.object({ amount: MoneyMatcherSchema.optional() }),
	).optional(),
};
