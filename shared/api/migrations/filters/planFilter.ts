import { z } from "zod/v4";
import { arrayFilter } from "./arrayFilter.js";
import {
	BooleanMatcherSchema,
	nullableObjectFilter,
	NumberMatcherSchema,
	StringMatcherSchema,
} from "./matcher.js";
import { PlanItemFilterSchema } from "./planItemFilter.js";

const PlanPriceFilterInner = z.object({});

export type PlanFilter = {
	plan_id?: z.infer<typeof StringMatcherSchema>;
	version?: z.infer<typeof NumberMatcherSchema>;
	price?:
		| null
		| { $eq?: null; $ne?: null }
		| z.infer<typeof PlanPriceFilterInner>;
	addon?: z.infer<typeof BooleanMatcherSchema>;
	paid?: z.infer<typeof BooleanMatcherSchema>;
	recurring?: z.infer<typeof BooleanMatcherSchema>;
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
