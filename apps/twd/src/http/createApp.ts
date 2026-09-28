import { Hono } from "hono";
import { renderTwdError, TwdError } from "./apiError.ts";
import { authMiddleware } from "./middleware/authMiddleware.ts";
import { corsMiddleware } from "./middleware/corsMiddleware.ts";
import { accountsRoutes } from "./routes/accounts.ts";
import { authRoutes } from "./routes/auth.ts";
import { capacityRoutes } from "./routes/capacity.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { costsRoutes } from "./routes/costs.ts";
import { ingressRoutes } from "./routes/ingress.ts";
import { jobsRoutes } from "./routes/jobs.ts";
import { keysRoutes } from "./routes/keys.ts";
import { liveRoutes } from "./routes/live.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { resultsRoutes } from "./routes/results.ts";
import { runsRoutes } from "./routes/runs.ts";
import { webhooksRoutes } from "./routes/webhooks.ts";
import type { TwdHono } from "./types/twdHono.ts";

/** CORS, then auth (sets ctx); public prefixes: /health /auth /webhooks /ingress. */
export const createApp = () =>
	new Hono<TwdHono>()
		.use("*", corsMiddleware())
		.use("*", authMiddleware)
		.get("/health", (c) => c.json({ ok: true }))
		.route("/", authRoutes)
		.route("/", webhooksRoutes)
		.route("/", ingressRoutes)
		.route("/", catalogRoutes)
		.route("/", runsRoutes)
		.route("/", keysRoutes)
		.route("/", accountsRoutes)
		.route("/", jobsRoutes)
		.route("/", resultsRoutes)
		.route("/", capacityRoutes)
		.route("/", costsRoutes)
		.route("/", mcpRoutes)
		.route("/", liveRoutes)
		.onError((error, c) =>
			error instanceof TwdError
				? renderTwdError({ c, error })
				: c.json(
						{
							error: {
								code: "internal",
								message: error.message,
								next: "Retry once; if it repeats, report it.",
								escalate:
									"twd internal error — share the request id with the twd owner.",
							},
						},
						500,
					),
		);
