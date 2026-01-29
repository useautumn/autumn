import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the aggregate pipe */
export const aggregatePipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	group_value: z.string(),
	total_value: z.number(),
});

export type AggregatePipeRow = z.infer<typeof aggregatePipeResponseSchema>;

/** Parameters schema for the aggregate pipe */
export const aggregatePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
	group_by: z.string().optional(),
});

export type AggregatePipeParams = z.infer<typeof aggregatePipeParamsSchema>;

/** Creates the aggregate pipe caller */
export const createAggregatePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate",
		parameters: aggregatePipeParamsSchema,
		data: aggregatePipeResponseSchema,
	});
