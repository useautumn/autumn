import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the aggregate_simple pipe */
export const aggregateSimplePipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	total_value: z.number(),
});

export type AggregateSimplePipeRow = z.infer<
	typeof aggregateSimplePipeResponseSchema
>;

/** Parameters schema for the aggregate_simple pipe */
export const aggregateSimplePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
});

export type AggregateSimplePipeParams = z.infer<
	typeof aggregateSimplePipeParamsSchema
>;

/** Creates the aggregate_simple pipe caller */
export const createAggregateSimplePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_simple",
		parameters: aggregateSimplePipeParamsSchema,
		data: aggregateSimplePipeResponseSchema,
	});
