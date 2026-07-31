import { z } from "zod/v4";

// Filter values reach raw SQL predicates (safely bound) and are persisted in
// export snapshots, so both count and length are bounded.
const MAX_FILTER_VALUES = 100;
const MAX_FILTER_VALUE_LENGTH = 200;

const FilterValuesSchema = z
	.array(z.string().max(MAX_FILTER_VALUE_LENGTH))
	.max(MAX_FILTER_VALUES);

export const CustomerListFiltersSchema = z.object({
	status: FilterValuesSchema.optional(),
	version: FilterValuesSchema.optional(),
	none: z.boolean().optional(),
	processor: FilterValuesSchema.optional(),
	interval: FilterValuesSchema.optional(),
});

export type CustomerListFilters = z.infer<typeof CustomerListFiltersSchema>;
