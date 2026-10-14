import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const aggregateDeductionsPipeResponseSchema = z.object({
	period: z.string(),
	balance_feature_id: z.string(),
	balance_id: z.string(),
	plan_id: z.string(),
	reset_interval: z.string(),
	group_value: z.string(),
	deducted: z.number(),
	deduction_count: z.number(),
	_truncated: z
		.union([z.boolean(), z.number()])
		.transform((v) => Boolean(v))
		.optional(),
});

export type AggregateDeductionsPipeRow = z.infer<
	typeof aggregateDeductionsPipeResponseSchema
>;

export const aggregateDeductionsPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	customer_id: z.string(),
	start_date: z.string(),
	end_date: z.string(),
	bin_size: z.string(),
	timezone: z.string(),
	feature_ids: z.array(z.string()).optional(),
	entity_id: z.string().optional(),
	group_column: z
		.enum(["entity_id", "source_feature_id", "plan_id"])
		.optional(),
	property_key: z.string().optional(),
	max_groups: z.number().int().min(1).max(250).optional(),
});

export const assertDeductionGroupingUnambiguous = (params: {
	group_column?: string;
	property_key?: string;
}) => {
	if (params.group_column !== undefined && params.property_key !== undefined) {
		throw new Error(
			"group_column and property_key are mutually exclusive on aggregate_deductions",
		);
	}
};

export type AggregateDeductionsPipeParams = z.infer<
	typeof aggregateDeductionsPipeParamsSchema
>;

export const createAggregateDeductionsPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_deductions",
		parameters: aggregateDeductionsPipeParamsSchema,
		data: aggregateDeductionsPipeResponseSchema,
	});
