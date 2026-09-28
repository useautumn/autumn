import { Hono } from "hono";
import { cancelJob } from "../../internal/jobs/actions/cancelJob.ts";
import { getJob } from "../../internal/jobs/actions/getJob.ts";
import { listJobs } from "../../internal/jobs/actions/listJobs.ts";
import { ListJobsQuery } from "../../internal/jobs/types/listJobsQuery.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const jobsRoutes = new Hono<TwdHono>()
	.get("/jobs", async (c) => {
		const parsed = ListJobsQuery.safeParse(c.req.query());
		if (!parsed.success) {
			throw new TwdError({
				status: 400,
				code: "invalid_query",
				message: parsed.error.message,
				next: "Use status=live|finished|all, kind=warm|swarm|nuke|reinit_keys, limit=1..200.",
			});
		}
		return c.json({
			jobs: await listJobs({ ctx: c.get("ctx"), query: parsed.data }),
		});
	})
	.get("/jobs/:id", async (c) =>
		c.json(await getJob({ ctx: c.get("ctx"), jobId: c.req.param("id") })),
	)
	.post("/jobs/:id/cancel", async (c) =>
		c.json(await cancelJob({ ctx: c.get("ctx"), jobId: c.req.param("id") })),
	);
