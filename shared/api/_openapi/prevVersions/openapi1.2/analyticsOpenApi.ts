import {
	AnalyticsAggregationBodySchema,
	AnalyticsAggregationResponseSchema,
} from "../../../events/aggregation/eventAggregationSchema.js";

export const analyticsOpenApi = {
	"/query": {
		post: {
			summary: "Query Analytics Aggregation",
			tags: ["analytics"],
			requestBody: {
				content: {
					"application/json": {
						schema: AnalyticsAggregationBodySchema,
					},
				},
			},
			responses: {
				"200": {
					description: "Analytics aggregation results",
					content: {
						"application/json": {
							schema: AnalyticsAggregationResponseSchema,
						},
					},
				},
			},
		},
	},
};
