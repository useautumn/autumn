import z from "zod/v4";

export const RangeEnum = z
	.enum(["24h", "7d", "30d", "90d", "last_cycle", "1bc", "3bc"])
	.default("1bc");

export type RangeEnum = z.infer<typeof RangeEnum>;

export const AnalyticsAggregationBodySchema = z.object({
	customer_id: z.string(),
	feature_id: z.string().or(z.array(z.string())),
	group_by: z.string().optional(),
	range: RangeEnum,
	bucket_size: z.enum(["hour", "day"]).default("day"),
});

export type AnalyticsAggregationBody = z.infer<
	typeof AnalyticsAggregationBodySchema
>;

export const AnalyticsAggregationResponseSchema = z.object({
	data: z.array(
		z.object({
			period: z.string(),
			count: z.number(),
		}),
	),
});

export type AnalyticsAggregationResponse = z.infer<
	typeof AnalyticsAggregationResponseSchema
>;
