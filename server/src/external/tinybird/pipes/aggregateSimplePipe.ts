import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const aggregateSimplePipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	total_value: z.number(),
	event_count: z.number().optional(),
});

export type AggregateSimplePipeRow = z.infer<
	typeof aggregateSimplePipeResponseSchema
>;

export const aggregateSimplePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	filter_key_0: z.string().optional(),
	filter_value_0: z.string().optional(),
	filter_key_1: z.string().optional(),
	filter_value_1: z.string().optional(),
	filter_key_2: z.string().optional(),
	filter_value_2: z.string().optional(),
	filter_key_3: z.string().optional(),
	filter_value_3: z.string().optional(),
	filter_key_4: z.string().optional(),
	filter_value_4: z.string().optional(),
	use_monthly_rollup: z.enum(["0", "1"]).optional(),
});

export type AggregateSimplePipeParams = z.infer<
	typeof aggregateSimplePipeParamsSchema
>;

export const createAggregateSimplePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_simple",
		parameters: aggregateSimplePipeParamsSchema,
		data: aggregateSimplePipeResponseSchema,
	});
