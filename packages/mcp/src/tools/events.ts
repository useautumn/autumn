import { ExtEventsAggregateParamsSchema } from "@autumn/shared";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	aggregateEvents: "/v1/events.aggregate",
} as const;

const schemas = {
	aggregateEvents: ExtEventsAggregateParamsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "aggregateEvents",
			description:
				"Aggregate a customer's tracked usage events by time bin — the source of truth for what was used and when (the same data the dashboard's Usage chart shows). Use this for any usage question: totals, last usage, usage over time, per-feature or per-entity breakdowns. Pass feature_id (required) plus customer_id; use range (24h, 7d, 30d, 90d, last_cycle, 1bc = current billing cycle, 3bc = last three) or custom_range in epoch milliseconds; bin_size hour/day/week/month. Not for API debugging — use the request-log tools for failed calls, status codes, and webhook deliveries.",
		}),
	],
} satisfies ToolDomain;

export const events = { endpoints, schemas, domain };
