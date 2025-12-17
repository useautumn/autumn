import { z } from "zod/v4";
import { BinSizeEnum } from "../components/binsizeEnum";
import { RangeEnum } from "../components/rangeEnum";

export const ExtEventsAggregateParamsSchema = z.object({
	customer_id: z
		.string()
		.min(1)
		.meta({ description: "Customer ID to aggregate events for" }),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
		.meta({ description: "Feature ID(s) to aggregate events for" }),
	group_by: z.string().startsWith("properties.").optional().meta({
		description:
			"Property to group events by. If provided, each key in the response will be an object with distinct groups as the keys",
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
