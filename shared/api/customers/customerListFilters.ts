import { z } from "zod/v4";

// Bounds cap SQL clause fan-out; far above any legitimate dashboard selection.
const MAX_FILTER_VALUES = 1000;
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
