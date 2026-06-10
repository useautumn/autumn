import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { queryLogs } from "../actions/queryLogs/queryLogs.js";
import { parseRestrictedApl } from "../parser/restrictedApl.js";
import {
	getQueryLogsRangePolicy,
	LogsRangeSchema,
	resolveLogsRange,
} from "./logsRequestUtils.js";

const QueryLogsSchema = z
	.object({
		query: z.string().min(1).max(4000),
		range: LogsRangeSchema.optional(),
		limit: z.coerce.number().int().min(1).max(200).default(100),
	})
	.strict();

export const handleQueryLogs = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: QueryLogsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const ast = parseRestrictedApl({
			query: body.query,
			allowedStages: ["where", "summarize", "project", "orderBy", "limit"],
		});
		const rangePolicy = getQueryLogsRangePolicy(ast);

		const range = resolveLogsRange({
			startDate: body.range?.start_date,
			endDate: body.range?.end_date,
			...rangePolicy,
		});

		const result = await queryLogs({
			ctx,
			query: body.query,
			range,
			limit: body.limit,
		});

		return c.json(result);
	},
});
