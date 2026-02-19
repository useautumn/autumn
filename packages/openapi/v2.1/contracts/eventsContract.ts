import { ExtEventsAggregateParamsSchema } from "@api/events/aggregate/eventsAggregateParams.js";
import {
	EVENTS_AGGREGATE_EXAMPLE_V1_FLAT,
	EVENTS_AGGREGATE_EXAMPLE_V1_GROUPED,
	EventsAggregateResponseV1Schema,
} from "@api/events/aggregate/eventsAggregateResponseV1.js";
import { ApiEventsListParamsSchema } from "@api/events/list/eventsListParams.js";
import {
	ApiEventsListResponseSchema,
	EVENTS_LIST_EXAMPLE,
} from "@api/events/list/eventsListResponse.js";
import { oc } from "@orpc/contract";

export const eventsListContract = oc
	.route({
		method: "POST",
		path: "/v1/events.list",
		operationId: "listEvents",
		tags: ["events"],
		description:
			"List usage events for your organization. Filter by customer, feature, or time range.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ApiEventsListParamsSchema.meta({
			title: "EventsListParams",
			examples: [
				{
					customer_id: "cus_123",
					limit: 50,
				},
				{
					feature_id: "api_calls",
					custom_range: {
						start: 1704067200000,
						end: 1706745600000,
					},
				},
			],
		}),
	)
	.output(
		ApiEventsListResponseSchema.meta({
			examples: [EVENTS_LIST_EXAMPLE],
		}),
	);

export const eventsAggregateContract = oc
	.route({
		method: "POST",
		path: "/v1/events.aggregate",
		operationId: "aggregateEvents",
		tags: ["events"],
		description:
			"Aggregate usage events by time period. Returns usage totals grouped by feature and optionally by a custom property.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "aggregate",
		}),
	})
	.input(
		ExtEventsAggregateParamsSchema.meta({
			title: "EventsAggregateParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "api_calls",
					range: "30d",
					bin_size: "day",
				},
				{
					customer_id: "cus_123",
					feature_id: ["api_calls", "messages"],
					range: "7d",
					group_by: "properties.model",
				},
			],
		}),
	)
	.output(
		EventsAggregateResponseV1Schema.meta({
			examples: [
				EVENTS_AGGREGATE_EXAMPLE_V1_FLAT,
				EVENTS_AGGREGATE_EXAMPLE_V1_GROUPED,
			],
		}),
	);
