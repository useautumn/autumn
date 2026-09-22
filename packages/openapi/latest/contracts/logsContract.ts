import { oc } from "@orpc/contract";
import { z } from "zod/v4";

const LogsRangeSchema = z
	.object({
		start_date: z
			.string()
			.optional()
			.describe(
				"Start of the time window in ISO 8601 format. Defaults to 30 minutes before end_date.",
			),
		end_date: z
			.string()
			.optional()
			.describe("End of the time window in ISO 8601 format. Defaults to now."),
	})
	.strict()
	.meta({
		title: "SearchLogsRange",
		description:
			"Time window to search. Defaults to the last 30 minutes. Maximum 7 days.",
	});

const SearchLogsParamsSchema = z
	.object({
		query: z
			.string()
			.max(4000)
			.optional()
			.describe(
				"Filter and sort logs using where, order by, and limit, joined with |. Omit to return recent logs.",
			),
		range: LogsRangeSchema.optional(),
		limit: z
			.number()
			.int()
			.min(1)
			.max(200)
			.optional()
			.describe(
				"Maximum number of logs to return, from 1 to 200. Defaults to 100.",
			),
	})
	.strict();

const RequestLogContextSchema = z.object({
	org_id: z
		.string()
		.nullable()
		.describe("Autumn organization that made the request."),
	customer_id: z
		.string()
		.nullable()
		.describe("Customer ID associated with the request, if available."),
	entity_id: z
		.string()
		.nullable()
		.describe("Entity ID associated with the request, if available."),
	auth_type: z
		.string()
		.nullable()
		.describe(
			"How the request was authenticated, such as secret_key or dashboard.",
		),
	user_id: z
		.string()
		.nullable()
		.describe("Authenticated user's ID, if available."),
	user_email: z
		.string()
		.nullable()
		.describe("Authenticated user's email, if available."),
});

const RequestLogEntrySchema = z.object({
	timestamp: z
		.string()
		.describe("When the log was recorded, in ISO 8601 format."),
	source: z
		.enum(["api_request", "stripe_webhook"])
		.describe("Whether this was an API request or an incoming Stripe webhook."),
	status_code: z.number().describe("HTTP response status code."),
	request: z
		.object({
			method: z
				.string()
				.nullable()
				.describe("HTTP method, such as GET or POST."),
			url: z.string().nullable().describe("Full request URL."),
			path: z
				.string()
				.nullable()
				.describe("Request path without the host or query string."),
		})
		.describe("HTTP request details."),
	context: RequestLogContextSchema.describe(
		"Organization, customer, and user associated with the request.",
	),
	stripe: z
		.object({
			event_id: z
				.string()
				.nullable()
				.describe("Stripe event ID, if this was a Stripe webhook."),
			event_type: z
				.string()
				.nullable()
				.describe("Stripe event type, such as customer.subscription.updated."),
			object_id: z
				.string()
				.nullable()
				.describe("ID of the Stripe object the event refers to."),
		})
		.describe("Stripe webhook details. Fields are null for API requests."),
	request_body: z
		.unknown()
		.nullable()
		.describe("Recorded request body, or null if unavailable."),
	response_body: z
		.unknown()
		.nullable()
		.describe("Recorded response body, or null if unavailable."),
});

const SearchLogsResponseSchema = z.object({
	list: z
		.array(RequestLogEntrySchema)
		.describe("Matching logs, newest first unless you specify an order."),
});

export const logsSearchContract = oc
	.route({
		method: "POST",
		path: "/v1/logs.search",
		operationId: "searchRequestLogs",
		tags: ["logs"],
		description:
			"Search API requests and incoming Stripe webhooks for your organization and environment.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "search",
		}),
	})
	.input(
		SearchLogsParamsSchema.meta({
			title: "SearchRequestLogsParams",
			examples: [
				{
					query: "where status_code >= 400 | order by timestamp desc",
					limit: 50,
				},
			],
		}),
	)
	.output(
		SearchLogsResponseSchema.meta({
			examples: [
				{
					list: [
						{
							timestamp: "2026-09-21T12:00:00.000Z",
							source: "api_request",
							status_code: 200,
							request: {
								method: "POST",
								url: "https://api.useautumn.com/v1/balances.check",
								path: "/v1/balances.check",
							},
							context: {
								org_id: "org_123",
								customer_id: "cus_123",
								entity_id: null,
								auth_type: "secret_key",
								user_id: "user_123",
								user_email: "user@example.com",
							},
							stripe: {
								event_id: null,
								event_type: null,
								object_id: null,
							},
							request_body: { customer_id: "cus_123" },
							response_body: { allowed: true },
						},
					],
				},
			],
		}),
	);
