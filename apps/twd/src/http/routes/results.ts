import { Hono } from "hono";
import {
	getFileHistory,
	listBaselines,
} from "../../internal/results/actions/queryResults.ts";
import {
	FileHistoryQuery,
	ListBaselinesQuery,
} from "../../internal/results/types/resultsSchemas.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const resultsRoutes = new Hono<TwdHono>()
	.get("/baselines", async (c) => {
		const query = ListBaselinesQuery.safeParse(c.req.query());
		if (!query.success) {
			throw new TwdError({
				status: 400,
				code: "invalid_query",
				message: query.error.issues.map((i) => i.message).join("; "),
				next: "Use ?sort=file|p50Ms|p90Ms|passRate|samples&order=asc|desc&limit=1..5000.",
			});
		}
		return c.json({
			baselines: await listBaselines({ ctx: c.get("ctx"), ...query.data }),
		});
	})
	.get("/files/history", async (c) => {
		const query = FileHistoryQuery.safeParse(c.req.query());
		if (!query.success) {
			throw new TwdError({
				status: 400,
				code: "missing_file",
				message: "Query parameter `file` is required.",
				next: "Pass ?file=<path> exactly as GET /catalog lists it; optional &branch=<name>&limit=1..500.",
			});
		}
		return c.json(await getFileHistory({ ctx: c.get("ctx"), ...query.data }));
	});
