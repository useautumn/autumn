import z from "zod/v4";

export const RangeEnum = z.enum([
	"24h",
	"7d",
	"30d",
	"90d",
	"last_cycle",
	"1bc",
	"3bc",
]);

export type RangeEnum = z.infer<typeof RangeEnum>;

export const BinSizeEnum = z.enum(["day", "hour"]).default("day");

export type BinSizeEnum = z.infer<typeof BinSizeEnum>;

export const EventAggregationBodySchema = z
	.object({
		customer_id: z.string().min(1),
		feature_id: z
			.string()
			.min(1)
			.or(z.array(z.string().min(1))),
		group_by: z.string().startsWith("properties.").optional(),
		range: RangeEnum.optional(),
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
	})
	.refine(
		(data) => {
			const customRangeExists =
				!!data.custom_range?.end && !!data.custom_range?.start;
			const rangeExists = data.range !== undefined;
			return !customRangeExists || !rangeExists;
		},
		{
			message: "Only one of range or custom_range may be provided",
			path: ["custom_range", "range"],
		},
	)
	.transform((data) => {
		if (!data.range && !data.custom_range) {
			return { ...data, range: "1bc" as const };
		}
		return data;
	});

export type EventAggregationBody = z.infer<typeof EventAggregationBodySchema>;

// Response without group_by: { period: number, [featureName]: number }
const EventAggregationResponseFlatSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.number()),
	),
});

// Response with group_by: { period: number, [featureName]: { [groupValue]: number } }
const EventAggregationResponseGroupedSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.record(z.string(), z.number())),
	),
});

const EventAggregationResponseTotalSchema = z.object({
	total: z.record(
		z.string(),
		z.object({
			count: z.number(),
			sum: z.number(),
		}),
	),
});

export const EventAggregationResponseSchema = z.union([
	EventAggregationResponseFlatSchema.and(EventAggregationResponseTotalSchema),
	EventAggregationResponseGroupedSchema.and(
		EventAggregationResponseTotalSchema,
	),
]);

export type EventAggregationResponse = z.infer<
	typeof EventAggregationResponseSchema
>;

export const EventAggregationErrorResponseSchema = z.object({
	code: z.string(),
	message: z.string(),
});

export type EventAggregationErrorResponse = z.infer<
	typeof EventAggregationErrorResponseSchema
>;
