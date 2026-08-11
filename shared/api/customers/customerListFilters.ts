import { z } from "zod/v4";

// Bounds cap SQL clause fan-out; far above any legitimate dashboard selection.
const MAX_FILTER_VALUES = 1000;
const MAX_FILTER_VALUE_LENGTH = 200;

const FilterValuesSchema = z
	.array(z.string().max(MAX_FILTER_VALUE_LENGTH))
	.max(MAX_FILTER_VALUES);

export const CreatedAtRangeSchema = z
	.object({
		start: z.coerce
			.number()
			.optional()
			.describe(
				"Include customers created at or after this timestamp (epoch milliseconds, inclusive)",
			),
		end: z.coerce
			.number()
			.optional()
			.describe(
				"Include customers created at or before this timestamp (epoch milliseconds, inclusive)",
			),
	})
	.refine(
		({ start, end }) =>
			start === undefined || end === undefined || start <= end,
		{ message: "created_at_range.start must be <= created_at_range.end" },
	);

export type CreatedAtRange = z.infer<typeof CreatedAtRangeSchema>;

export const CustomerListFiltersSchema = z.object({
	status: FilterValuesSchema.optional(),
	version: FilterValuesSchema.optional(),
	none: z.boolean().optional(),
	processor: FilterValuesSchema.optional(),
	interval: FilterValuesSchema.optional(),
	created_at_range: CreatedAtRangeSchema.optional(),
});

export type CustomerListFilters = z.infer<typeof CustomerListFiltersSchema>;
