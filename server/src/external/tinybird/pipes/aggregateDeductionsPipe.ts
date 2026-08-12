import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

/**
 * Response schema for the aggregate_deductions pipe.
 *
 * One row per (period, balance, group_value) — the finest grain the response needs.
 * `balances[]` in the API response is the sum across group_value; `grouped_values`
 * is the split. Both are derived from these rows in aggregateDeductions.
 */
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

/**
 * Parameters for the aggregate_deductions pipe.
 *
 * customer_id is required, not optional: it leads the sorting key on
 * events_deductions_hourly_mv, so pinning it keeps the query on the key prefix
 * rather than scanning the org. The handler rejects the request before we get here.
 *
 * feature_ids matches EITHER side of the edge — a deduction is included if the
 * tracked feature is in the list OR the balance's feature is.
 */
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
	// Property grouping reads raw `events` instead of the MV (which carries no
	// properties by design). Mutually exclusive with group_column.
	property_key: z.string().optional(),
	max_groups: z.number().int().min(1).max(250).optional(),
});

export type AggregateDeductionsPipeParams = z.infer<
	typeof aggregateDeductionsPipeParamsSchema
>;

/** Creates the aggregate_deductions pipe caller */
export const createAggregateDeductionsPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_deductions",
		parameters: aggregateDeductionsPipeParamsSchema,
		data: aggregateDeductionsPipeResponseSchema,
	});
