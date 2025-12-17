import z from "zod/v4";

export const EVENTS_AGGREGATE_EXAMPLE = {
	list: [
		{
			timestamp: 1762905600000,
			messages: 10,
			seats: 3,
		},
		{
			timestamp: 1762992000000,
			messages: 3,
			seats: 12,
		},
	],
	total: {
		messages: {
			count: 2,
			sum: 13,
		},
		seats: {
			count: 2,
			sum: 15,
		},
	},
};

// Response without group_by: { period: number, [featureName]: number }
const EventAggregateResponseFlatSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.number()),
	),
});

// Response with group_by: { period: number, [featureName]: { [groupValue]: number } }
const EventAggregateResponseGroupedSchema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.record(z.string(), z.number())),
	),
});

const EventAggregateResponseTotalSchema = z.object({
	total: z.record(
		z.string(),
		z.object({
			count: z.number(),
			sum: z.number(),
		}),
	),
});

export const EventsAggregateResponseSchema = z.union([
	EventAggregateResponseFlatSchema.and(EventAggregateResponseTotalSchema).meta({
		id: "EventAggregateResponseFlat",
		title: "No Group",
		description:
			"Response when group_by is not provided. Feature values are numbers.",
	}),
	EventAggregateResponseGroupedSchema.and(
		EventAggregateResponseTotalSchema,
	).meta({
		id: "EventAggregateResponseGrouped",
		title: "With Group",
		description:
			"Response when group_by is provided. Feature values are objects with group values as keys.",
	}),
]);

export type EventsAggregateResponse = z.infer<
	typeof EventsAggregateResponseSchema
>;
