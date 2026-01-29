import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the aggregate_fast pipe */
export const aggregateFastPipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	group_value: z.string(),
	total_value: z.number(),
});

export type AggregateFastPipeRow = z.infer<
	typeof aggregateFastPipeResponseSchema
>;

/** Parameters schema for the aggregate_fast pipe */
export const aggregateFastPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
	property_key: z.string(), // '' for ungrouped, 'billing_source' for grouped
});

export type AggregateFastPipeParams = z.infer<
	typeof aggregateFastPipeParamsSchema
>;

/** Creates the aggregate_fast pipe caller */
export const createAggregateFastPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_fast",
		parameters: aggregateFastPipeParamsSchema,
		data: aggregateFastPipeResponseSchema,
	});
