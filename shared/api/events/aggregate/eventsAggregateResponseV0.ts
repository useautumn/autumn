import z from "zod/v4";

export const EVENTS_AGGREGATE_EXAMPLE_V0 = {
	list: [
		{
			period: 1762905600000,
			messages: 10,
			seats: 3,
		},
		{
			period: 1762992000000,
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
const EventAggregateResponseFlatV0Schema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.number()),
	),
});

// Response with group_by: { period: number, [featureName]: { [groupValue]: number } }
const EventAggregateResponseGroupedV0Schema = z.object({
	list: z.array(
		z
			.object({
				period: z.number(),
			})
			.catchall(z.record(z.string(), z.number())),
	),
});

const EventAggregateResponseTotalV0Schema = z.object({
	total: z.record(
		z.string(),
		z.object({
			count: z.number(),
			sum: z.number(),
		}),
	),
});

export const EventsAggregateResponseV0Schema = z.union([
	EventAggregateResponseFlatV0Schema.and(
		EventAggregateResponseTotalV0Schema,
	).meta({
		id: "EventAggregateResponseFlatV0",
		title: "No Group",
		description:
			"Response when group_by is not provided. Feature values are numbers.",
	}),
	EventAggregateResponseGroupedV0Schema.and(
		EventAggregateResponseTotalV0Schema,
	).meta({
		id: "EventAggregateResponseGroupedV0",
		title: "With Group",
		description:
			"Response when group_by is provided. Feature values are objects with group values as keys.",
	}),
]);

export type EventsAggregateResponseV0 = z.infer<
	typeof EventsAggregateResponseV0Schema
>;
