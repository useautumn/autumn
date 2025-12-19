import { ExtEventsAggregateParamsSchema } from "@api/events/aggregate/eventsAggregateParams.js";
import {
	EVENTS_AGGREGATE_EXAMPLE,
	EventsAggregateResponseSchema,
} from "@api/events/aggregate/eventsAggregateResponse.js";
import { ApiEventsListParamsSchema } from "@api/events/list/eventsListParams.js";
import {
	ApiEventsListResponseSchema,
	EVENTS_LIST_EXAMPLE,
} from "@api/events/list/eventsListResponse.js";

export const eventsOpenApi = {
	"/events/list": {
		post: {
			summary: "List Events",
			tags: ["events"],
			requestBody: {
				content: {
					"application/json": {
						schema: ApiEventsListParamsSchema,
					},
				},
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: ApiEventsListResponseSchema.meta({
								example: EVENTS_LIST_EXAMPLE,
							}),
						},
					},
				},
			},
		},
	},
	"/events/aggregate": {
		post: {
			summary: "Aggregate Events",
			tags: ["events"],
			requestBody: {
				content: {
					"application/json": {
						schema: ExtEventsAggregateParamsSchema,
					},
				},
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: EventsAggregateResponseSchema.meta({
								example: EVENTS_AGGREGATE_EXAMPLE,
							}),
						},
					},
				},
			},
		},
	},

	// LEGACY
	"/query": {
		post: {
			summary: "Query Analytics Aggregation",
			tags: ["analytics"],
			requestBody: {
				content: {
					"application/json": {
						schema: ExtEventsAggregateParamsSchema,
					},
				},
			},
			responses: {
				"200": {
					description: "Analytics aggregation results",
					content: {
						"application/json": {
							schema: EventsAggregateResponseSchema,
						},
					},
				},
			},
		},
	},
};
