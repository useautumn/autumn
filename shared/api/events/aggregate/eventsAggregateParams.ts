import { z } from "zod/v4";
import { BinSizeEnum } from "../components/binsizeEnum";
import { RangeEnum } from "../components/rangeEnum";

export const ExtEventsAggregateParamsSchema = z.object({
	customer_id: z
		.string()
		.min(1)
		.optional()
		.meta({ description: "Customer ID to aggregate events for" }),
	entity_id: z.string().min(1).optional().meta({
		description:
			"Entity ID to filter aggregated events for (e.g., per-seat or per-resource limits)",
	}),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
		.meta({ description: "Feature ID(s) to aggregate events for" }),
	group_by: z
		.string()
		.refine(
			(val) =>
				val.startsWith("properties.") ||
				val === "$customer_id" ||
				val === "$entity_id",
			{
				message:
					'group_by must start with "properties." or be "$customer_id" or "$entity_id"',
			},
		)
		.optional()
		.meta({
			description:
				'Property to group events by (e.g. "properties.region"), or "$customer_id" / "$entity_id" to group by those columns',
		}),
	range: RangeEnum.optional().meta({
		description:
			"Time range to aggregate events for. Either range or custom_range must be provided",
	}),
	bin_size: BinSizeEnum.optional().meta({
		description:
			"Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day",
	}),
	custom_range: z
		.object({
			start: z.number(),
			end: z.number(),
		})
		.refine((data) => data.start < data.end, {
			message: "start must be before end",
		})
		.optional()
		.meta({
			description:
				"Custom time range to aggregate events for. If provided, range must not be provided",
		}),
	filter_by: z.record(z.string(), z.string()).optional().meta({
		description:
			'Filter events by property values, e.g. {"model": "gpt-4", "region": "us"}. Maximum 5 filters.',
	max_groups: z.number().int().min(1).max(250).optional().meta({
		description:
			"Maximum number of distinct group values to return per time bin when using group_by. Remaining values are bundled into an 'Other' bucket. Defaults to 9",
	}),
});

export const EventsAggregateParamsSchema =
	ExtEventsAggregateParamsSchema.refine(
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
		.refine(
			(data) => !data.filter_by || Object.keys(data.filter_by).length <= 5,
			{
				message: "filter_by supports a maximum of 5 filters",
				path: ["filter_by"],
			},
		)
		.transform((data) => {
			if (!data.range && !data.custom_range) {
				return { ...data, range: "1bc" as const };
			}
			return data;
		})
		.transform((data) => {
			if (!data.bin_size) {
				// If range is 24h, set bin_size to hour, otherwise set bin_size to day
				if (data.range === "24h") {
					return { ...data, bin_size: "hour" as const };
				}
				return { ...data, bin_size: "day" as const };
			}
			return data;
		});

export type EventsAggregateParams = z.infer<typeof EventsAggregateParamsSchema>;
