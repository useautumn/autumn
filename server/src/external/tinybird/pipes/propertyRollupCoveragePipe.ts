import type { Tinybird } from "@chronark/zod-bird";
import { z } from "../tinybirdZod.js";

export const propertyRollupCoveragePipeResponseSchema = z.object({
	event_name: z.string(),
	event_count: z.number(),
});

export type PropertyRollupCoveragePipeRow = z.infer<
	typeof propertyRollupCoveragePipeResponseSchema
>;

export const propertyRollupCoveragePipeParamsSchema = z.object({
	org_id: z.string(),
	env: z.string(),
	event_names: z.array(z.string()),
	start_date: z.string(),
	end_date: z.string(),
	property_key: z.string(),
});

export type PropertyRollupCoveragePipeParams = z.infer<
	typeof propertyRollupCoveragePipeParamsSchema
>;

export const createPropertyRollupCoveragePipe = (tb: Tinybird) =>
	tb.buildPipe({
		pipe: "property_rollup_coverage",
		parameters: propertyRollupCoveragePipeParamsSchema,
		data: propertyRollupCoveragePipeResponseSchema,
	});
