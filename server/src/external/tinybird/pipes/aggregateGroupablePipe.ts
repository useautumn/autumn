import type { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Response schema for the aggregate_groupable pipe */
export const aggregateGroupablePipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	group_value: z.string(),
	total_value: z.number(),
	_truncated: z
		.union([z.boolean(), z.number()])
		.transform((v) => Boolean(v))
		.optional(),
});

export type AggregateGroupablePipeRow = z.infer<
	typeof aggregateGroupablePipeResponseSchema
>;

/** Parameters schema for the aggregate_groupable pipe */
export const aggregateGroupablePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
	group_column: z.enum(["property", "customer_id"]).default("property"),
	property_key: z.string().optional(), // the property name without 'properties.' prefix (not needed when group_column is "customer_id")
});

export type AggregateGroupablePipeParams = z.infer<
	typeof aggregateGroupablePipeParamsSchema
>;

/** Creates the aggregate_groupable pipe caller */
export const createAggregateGroupablePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_groupable",
		parameters: aggregateGroupablePipeParamsSchema,
		data: aggregateGroupablePipeResponseSchema,
	});
