import {
	EventAggregationBodySchema,
	EventAggregationResponseSchema,
} from "../../../events/aggregation/eventAggregationSchema.js";

export const analyticsOpenApi = {
	"/query": {
		post: {
			summary: "Query Analytics Aggregation",
			tags: ["analytics"],
			requestBody: {
				content: {
					"application/json": {
						schema: EventAggregationBodySchema,
					},
				},
			},
			responses: {
				"200": {
					description: "Analytics aggregation results",
					content: {
						"application/json": {
							schema: EventAggregationResponseSchema,
						},
					},
				},
			},
		},
	},
};
