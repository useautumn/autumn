import { z } from "zod/v4";

export const CustomerListFiltersSchema = z.object({
	status: z.array(z.string()).optional(),
	version: z.array(z.string()).optional(),
	none: z.boolean().optional(),
	processor: z.array(z.string()).optional(),
	interval: z.array(z.string()).optional(),
});

export type CustomerListFilters = z.infer<typeof CustomerListFiltersSchema>;
