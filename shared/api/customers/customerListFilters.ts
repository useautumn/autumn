import { z } from "zod/v4";

const FilterValuesSchema = z.array(z.string());

export const CustomerListFiltersSchema = z.object({
	status: FilterValuesSchema.optional(),
	version: FilterValuesSchema.optional(),
	none: z.boolean().optional(),
	processor: FilterValuesSchema.optional(),
	interval: FilterValuesSchema.optional(),
});

export type CustomerListFilters = z.infer<typeof CustomerListFiltersSchema>;

// Export snapshots persist and replay these filters, so only that path bounds
// them; the live list endpoints bind values into parameterized SQL and stay uncapped.
const MAX_SNAPSHOT_FILTER_VALUES = 1000;
const MAX_SNAPSHOT_FILTER_VALUE_LENGTH = 200;

const BoundedFilterValuesSchema = z
	.array(z.string().max(MAX_SNAPSHOT_FILTER_VALUE_LENGTH))
	.max(MAX_SNAPSHOT_FILTER_VALUES);

export const BoundedCustomerListFiltersSchema =
	CustomerListFiltersSchema.extend({
		status: BoundedFilterValuesSchema.optional(),
		version: BoundedFilterValuesSchema.optional(),
		processor: BoundedFilterValuesSchema.optional(),
		interval: BoundedFilterValuesSchema.optional(),
	});
