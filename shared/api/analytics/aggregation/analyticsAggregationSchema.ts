import z from "zod/v4";

export const RangeEnum = z
	.enum(["24h", "7d", "30d", "90d", "last_cycle", "1bc", "3bc"])
	.default("1bc");

export type RangeEnum = z.infer<typeof RangeEnum>;

export const BinSizeEnum = z.enum(["day", "hour"]).default("day");

export type BinSizeEnum = z.infer<typeof BinSizeEnum>;

export const AnalyticsAggregationBodySchema = z.object({
	customer_id: z.string().min(1),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1))),
	group_by: z.string().optional(),
	range: RangeEnum,
	bin_size: BinSizeEnum,
	custom_range: z
		.object({
			start: z.number(),
			end: z.number(),
		})
		.refine((data) => data.start < data.end, {
			message: "start must be before end",
		})
		.optional(),
});

export type AnalyticsAggregationBody = z.infer<
	typeof AnalyticsAggregationBodySchema
>;

// Response without group_by: { period: number, [featureName]: number }
const AnalyticsAggregationResponseFlatSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.number()),
	),
});

// Response with group_by: { period: number, [featureName]: { [groupValue]: number } }
const AnalyticsAggregationResponseGroupedSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.record(z.string(), z.number())),
	),
});

const AnalyticsAggregationResponseTotalSchema = z.object({
	total: z.record(
		z.string(),
		z.object({
			count: z.number(),
			sum: z.number(),
		}),
	),
});

export const AnalyticsAggregationResponseSchema = z.union([
	AnalyticsAggregationResponseFlatSchema.and(
		AnalyticsAggregationResponseTotalSchema,
	),
	AnalyticsAggregationResponseGroupedSchema.and(
		AnalyticsAggregationResponseTotalSchema,
	),
]);

export type AnalyticsAggregationResponse = z.infer<
	typeof AnalyticsAggregationResponseSchema
>;

export const AnalyticsAggregationErrorResponseSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type AnalyticsAggregationErrorResponse = z.infer<
	typeof AnalyticsAggregationErrorResponseSchema
>;
