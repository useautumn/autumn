import { z } from "zod/v4";

export const EVENTS_AGGREGATE_EXAMPLE_V1_FLAT = {
	list: [
		{
			period: 1762905600000,
			values: {
				messages: 10,
				sessions: 3,
			},
		},
		{
			period: 1762992000000,
			values: {
				messages: 3,
				sessions: 12,
			},
		},
	],
	total: {
		messages: {
			count: 2,
			sum: 13,
		},
		sessions: {
			count: 2,
			sum: 15,
		},
	},
};

export const EVENTS_AGGREGATE_EXAMPLE_V1_GROUPED = {
	list: [
		{
			period: 1762905600000,
			values: {
				messages: 10,
				sessions: 3,
			},
			grouped_values: {
				messages: { api: 5, web: 5 },
				sessions: { api: 2, web: 1 },
			},
		},
		{
			period: 1762992000000,
			values: {
				messages: 3,
				sessions: 12,
			},
			grouped_values: {
				messages: { api: 1, web: 2 },
				sessions: { api: 10, web: 2 },
			},
		},
	],
	total: {
		messages: {
			count: 2,
			sum: 13,
		},
		sessions: {
			count: 2,
			sum: 15,
		},
	},
};

const EventAggregateListItemV1Schema = z.object({
	period: z.number().meta({
		description: "Unix timestamp (epoch ms) for this time period",
	}),
	values: z.record(z.string(), z.number()).meta({
		description: "Aggregated values per feature: { [featureId]: number }",
	}),
	grouped_values: z
		.record(z.string(), z.record(z.string(), z.number()))
		.optional()
		.meta({
			description:
				"Values broken down by group (only present when group_by is used): { [featureId]: { [groupValue]: number } }",
		}),
});

const EventAggregateTotalItemSchema = z.object({
	count: z.number().meta({ description: "Number of events for this feature" }),
	sum: z.number().meta({ description: "Sum of event values for this feature" }),
});

export const EventsAggregateResponseV1Schema = z.object({
	list: z.array(EventAggregateListItemV1Schema).meta({
		description: "Array of time periods with aggregated values",
	}),
	total: z.record(z.string(), EventAggregateTotalItemSchema).meta({
		description:
			"Total aggregations per feature. Keys are feature IDs, values contain count and sum.",
	}),
});

export type EventsAggregateResponseV1 = z.infer<
	typeof EventsAggregateResponseV1Schema
>;

export type EventAggregateListItemV1 = z.infer<
	typeof EventAggregateListItemV1Schema
>;
