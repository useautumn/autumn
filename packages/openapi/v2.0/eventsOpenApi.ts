import {
	ApiEventsListParamsSchema,
	ApiEventsListResponseSchema,
	EVENTS_AGGREGATE_EXAMPLE_V0,
	EVENTS_LIST_EXAMPLE,
	EventsAggregateResponseV0Schema,
	ExtEventsAggregateParamsSchema,
} from "@autumn/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";

export const eventsOpenApi: ZodOpenApiPathsObject = {
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
							schema: EventsAggregateResponseV0Schema.meta({
								example: EVENTS_AGGREGATE_EXAMPLE_V0,
							}),
						},
					},
				},
			},
		},
	},
};
