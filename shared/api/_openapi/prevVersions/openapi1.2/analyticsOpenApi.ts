import {
	AnalyticsAggregationBodySchema,
	AnalyticsAggregationErrorResponseSchema,
	AnalyticsAggregationResponseSchema,
} from "../../../analytics/aggregation/analyticsAggregationSchema.js";

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
				"400": {
					description: "Bad Request",
					content: {
						"application/json": {
							schema: AnalyticsAggregationErrorResponseSchema,
						},
					},
				},
				"404": {
					description: "Not Found",
					content: {
						"application/json": {
							schema: AnalyticsAggregationErrorResponseSchema,
						},
					},
				},
				"500": {
					description: "Internal Server Error",
					content: {
						"application/json": {
							schema: AnalyticsAggregationErrorResponseSchema,
						},
					},
				},
			},
		},
	},
};
