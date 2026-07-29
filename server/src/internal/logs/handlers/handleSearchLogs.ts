import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { searchRequestLogs } from "../actions/searchRequestLogs/searchRequestLogs.js";
import {
	LogsRangeSchema,
	parseLogsQueryOrThrow,
	resolveLogsRange,
} from "./logsRequestUtils.js";

const SearchLogsSchema = z
	.object({
		query: z.string().max(4000).optional(),
		range: LogsRangeSchema.optional(),
		limit: z.coerce.number().int().min(1).max(200).default(100),
	})
	.strict();

export const handleSearchLogs = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: SearchLogsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		parseLogsQueryOrThrow({
			query: body.query,
			allowedStages: ["where", "orderBy", "limit"],
		});

		const range = resolveLogsRange({
			startDate: body.range?.start_date,
			endDate: body.range?.end_date,
		});

		const result = await searchRequestLogs({
			ctx,
			query: body.query,
			range,
			limit: body.limit,
		});

		return c.json(result);
	},
});
