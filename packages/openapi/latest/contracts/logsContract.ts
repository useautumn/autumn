import { oc } from "@orpc/contract";
import { z } from "zod/v4";

const LogsRangeSchema = z
	.object({
		start_date: z.string().optional(),
		end_date: z.string().optional(),
	})
	.strict()
	.meta({ title: "SearchLogsRange" });

const SearchLogsParamsSchema = z
	.object({
		query: z.string().max(4000).optional(),
		range: LogsRangeSchema.optional(),
		limit: z.number().int().min(1).max(200).optional(),
	})
	.strict();

const RequestLogContextSchema = z.object({
	org_id: z.string().nullable(),
	customer_id: z.string().nullable(),
	entity_id: z.string().nullable(),
	auth_type: z.string().nullable(),
	user_id: z.string().nullable(),
	user_email: z.string().nullable(),
});

const RequestLogEntrySchema = z.object({
	timestamp: z.string(),
	source: z.enum(["api_request", "stripe_webhook"]),
	status_code: z.number(),
	request: z.object({
		method: z.string().nullable(),
		url: z.string().nullable(),
		path: z.string().nullable(),
	}),
	context: RequestLogContextSchema,
	stripe: z.object({
		event_id: z.string().nullable(),
		event_type: z.string().nullable(),
		object_id: z.string().nullable(),
	}),
	request_body: z.unknown().nullable(),
	response_body: z.unknown().nullable(),
});

const SearchLogsResponseSchema = z.object({
	list: z.array(RequestLogEntrySchema),
	unconfigured: z.boolean().optional(),
});

export const logsSearchContract = oc
	.route({
		method: "POST",
		path: "/v1/logs.search",
		operationId: "searchRequestLogs",
		tags: ["logs"],
		description:
			"Search tenant-scoped Autumn API request logs. Supports restricted APL filters, ordering, and limits over projected request-log fields.",
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
