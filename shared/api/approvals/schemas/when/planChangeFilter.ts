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

type FeatureQuantityFilter = {
	feature_id?: z.infer<typeof IdMatcherSchema>;
	quantity?: z.infer<typeof NumberMatcherSchema>;
	$and?: FeatureQuantityFilter[];
	$or?: FeatureQuantityFilter[];
};

const FeatureQuantityFilterSchema: z.ZodType<FeatureQuantityFilter> = z.lazy(
	() =>
		z.object({
			feature_id: IdMatcherSchema.optional(),
			quantity: NumberMatcherSchema.optional(),
			$and: z.array(FeatureQuantityFilterSchema).min(1).optional(),
			$or: z.array(FeatureQuantityFilterSchema).min(1).optional(),
		}),
);

type PlanChangeFields = {
	/** `null` = no trial. A shape = there is a trial and it matches. */
	free_trial?: z.infer<typeof FreeTrialFilterSchema>;
	feature_quantities?: z.infer<
		ReturnType<typeof arrayFilter<typeof FeatureQuantityFilterSchema>>
	>;
	/** The request passes `customize` for this plan. */
	customized?: boolean;
	$and?: PlanChangeFilter[];
	$or?: PlanChangeFilter[];
};

/** An incoming plan: the migration `PlanFilter` plus what the request sets on it. */
export type PlanChangeFilter = PlanFilter & PlanChangeFields;

const PlanChangeFieldsSchema: z.ZodType<PlanChangeFields> = z.lazy(() =>
	z.object({
		free_trial: FreeTrialFilterSchema.optional(),
		feature_quantities: arrayFilter(FeatureQuantityFilterSchema).optional(),
		customized: BooleanMatcherSchema.optional(),
		$and: z.array(PlanChangeFilterSchema).min(1).optional(),
		$or: z.array(PlanChangeFilterSchema).optional(),
	}),
);

// Intersected rather than re-declared, so plan fields stay the migration schema verbatim.
export const PlanChangeFilterSchema: z.ZodType<PlanChangeFilter> = z.lazy(() =>
	z.intersection(PlanFilterSchema, PlanChangeFieldsSchema),
);
