import { arrayFilter } from "@api/common/filters/arrayFilter";
import {
	BooleanMatcherSchema,
	enumMatcher,
	NumberMatcherSchema,
	nullableObjectFilter,
} from "@api/common/filters/matcher";
import {
	type PlanFilter,
	PlanFilterSchema,
} from "@api/migrations/filters/planFilter";
import { z } from "zod/v4";
import { IdMatcherSchema } from "./whenFields";

const FreeTrialFilterSchema = nullableObjectFilter(
	z.object({
		duration_length: NumberMatcherSchema.optional(),
		duration_type: enumMatcher(["day", "month", "year"]).optional(),
		card_required: BooleanMatcherSchema.optional(),
		on_end: enumMatcher(["bill", "revert"]).optional(),
	}),
);

const FeatureQuantityFilterSchema = z.object({
	feature_id: IdMatcherSchema.optional(),
	quantity: NumberMatcherSchema.optional(),
});

type PlanChangeFields = {
	/** `null` = no trial. A shape = there is a trial and it matches. */
	free_trial?: z.infer<typeof FreeTrialFilterSchema>;
	feature_quantities?: z.infer<
		ReturnType<typeof arrayFilter<typeof FeatureQuantityFilterSchema>>
	>;
	/** The request passes `customize` for this plan. */
	customized?: boolean;
	$or?: PlanChangeFilter[];
};

/** An incoming plan: the migration `PlanFilter` plus what the request sets on it. */
export type PlanChangeFilter = PlanFilter & PlanChangeFields;

const PlanChangeFieldsSchema: z.ZodType<PlanChangeFields> = z.lazy(() =>
	z.object({
		free_trial: FreeTrialFilterSchema.optional(),
		feature_quantities: arrayFilter(FeatureQuantityFilterSchema).optional(),
		customized: BooleanMatcherSchema.optional(),
		$or: z.array(PlanChangeFilterSchema).optional(),
	}),
);

// Intersected rather than re-declared, so plan fields stay the migration schema verbatim.
export const PlanChangeFilterSchema: z.ZodType<PlanChangeFilter> = z.lazy(() =>
	z.intersection(PlanFilterSchema, PlanChangeFieldsSchema),
);
