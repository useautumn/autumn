import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const logsRangeSchema = z
	.object({
		start_date: z.string().optional(),
		end_date: z.string().optional(),
	})
	.strict();

const searchRequestLogsSchema = z
	.object({
		query: z.string().max(4000).optional(),
		range: logsRangeSchema.optional(),
		limit: z.number().int().positive().max(200).optional(),
	})
	.strict();

const queryRequestLogsSchema = z
	.object({
		query: z.string().min(1).max(4000),
		range: logsRangeSchema.optional(),
		limit: z.number().int().positive().max(200).optional(),
	})
	.strict();

const endpoints = {
	searchRequestLogs: "/v1/logs.search",
	queryRequestLogs: "/v1/logs.query",
} as const;

const schemas = {
	searchRequestLogs: searchRequestLogsSchema,
	queryRequestLogs: queryRequestLogsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "searchRequestLogs",
			description:
				"Search tenant-scoped Autumn API request logs. Use this for listing matching request records, inspecting request/response bodies, and debugging recent customer API calls. Supports restricted APL over projected request-log fields only.",
		}),
		operation({
			id: "queryRequestLogs",
			description:
				"Query tenant-scoped Autumn API request logs with aggregate restricted APL. Use this for counts, grouping, and request-log statistics such as errors by path or status-code breakdowns.",
		}),
	],
} satisfies ToolDomain;

export const logs = { endpoints, schemas, domain };
