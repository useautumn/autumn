import { z } from "zod/v4";
import { arrayFilter } from "./arrayFilter.js";
import { StringMatcherSchema } from "./matcher.js";
import { PlanFilterSchema } from "./planFilter.js";
import { PlanItemFilterSchema } from "./planItemFilter.js";

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
