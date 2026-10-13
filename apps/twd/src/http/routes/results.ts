import { Hono } from "hono";
import { getDevStatus } from "../../internal/results/actions/getDevStatus.ts";
import { ingestResults } from "../../internal/results/actions/ingestResults.ts";
import {
	getFileHistory,
	listBaselines,
} from "../../internal/results/actions/queryResults.ts";
import {
	DevStatusBody,
	FileHistoryQuery,
	IngestResultsBody,
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
	})
	.post("/files/dev-status", async (c) => {
		const body = DevStatusBody.safeParse(await c.req.json().catch(() => null));
		if (!body.success) {
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: body.error.issues.map((i) => i.message).join("; "),
				next: 'Send JSON {"files": ["unit/…test.ts", …] (1..100), "limit"?: 1..50}.',
			});
		}
		return c.json({
			files: await getDevStatus({ ctx: c.get("ctx"), ...body.data }),
		});
	})
	.post("/results/ingest", async (c) => {
		const body = IngestResultsBody.safeParse(
			await c.req.json().catch(() => null),
		);
		if (!body.success) {
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: body.error.issues
					.slice(0, 5)
					.map((i) => `${i.path.join(".")}: ${i.message}`)
					.join("; "),
				next: 'Send JSON {"source": "ci", branch, sha (40 hex), ciRunId, results: [{file, status, durationMs, attempt?, passedTests?, failedTests?, failureSummary?}]}.',
			});
		}
		return c.json(await ingestResults({ ctx: c.get("ctx"), body: body.data }));
	});
