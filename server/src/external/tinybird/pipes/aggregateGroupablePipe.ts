import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const aggregateGroupablePipeResponseSchema = z.object({
	period: z.string(),
	event_name: z.string(),
	group_value: z.string(),
	total_value: z.number(),
	event_count: z.number().optional(),
	_truncated: z
		.union([z.boolean(), z.number()])
		.transform((v) => Boolean(v))
		.optional(),
});

export type AggregateGroupablePipeRow = z.infer<
	typeof aggregateGroupablePipeResponseSchema
>;

export const aggregateGroupablePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	customer_id: z.string().optional(),
	entity_id: z.string().optional(),
	group_column: z
		.enum(["property", "customer_id", "entity_id", "plan_id"])
		.default("property"),
	property_key: z.string().optional(),
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
	max_groups: z.number().int().min(1).max(250).optional(),
	group_ranking: z.enum(["bin", "window"]).optional(),
	rank_by: z.enum(["value", "count"]).optional(),
	use_daily_rollup: z.enum(["0", "1"]).optional(),
	use_monthly_rollup: z.enum(["0", "1"]).optional(),
	use_org_dimension_rollup: z.enum(["0", "1"]).optional(),
	use_org_property_rollup: z.enum(["0", "1"]).optional(),
	top_event_names: z.array(z.string()).optional(),
	top_customer_ids: z.array(z.string()).optional(),
	top_property_values: z.array(z.string()).optional(),
	skip_property_rollup: z.enum(["0", "1"]).optional(),
});

export type AggregateGroupablePipeParams = z.infer<
	typeof aggregateGroupablePipeParamsSchema
>;

export const createAggregateGroupablePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_groupable",
		parameters: aggregateGroupablePipeParamsSchema,
		data: aggregateGroupablePipeResponseSchema,
	});
