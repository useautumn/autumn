import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const aggregateGroupableTopGroupsPipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	max_groups: z.number().int().min(1).max(250).optional(),
	group_column: z.enum(["customer_id", "property"]).optional(),
	property_key: z.string().optional(),
});

export const aggregateGroupableTopGroupsPipeResponseSchema = z.object({
	event_name: z.string(),
	group_value: z.string(),
});

export type AggregateGroupableTopGroupsPipeRow = z.infer<
	typeof aggregateGroupableTopGroupsPipeResponseSchema
>;

/** Top customers or property values per event over a whole window, for org-wide window-ranked grouping */
export const createAggregateGroupableTopGroupsPipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "aggregate_groupable_top_groups",
		parameters: aggregateGroupableTopGroupsPipeParamsSchema,
		data: aggregateGroupableTopGroupsPipeResponseSchema,
	});
