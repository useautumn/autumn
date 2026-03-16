import type { Context, Next } from "hono";
import { dbCritical } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { matchRoute } from "./middlewareUtils.js";

/**
 * Routes that use the critical DB pool (short statement timeout, isolated connections).
 * Paths are relative to /v1 since apiRouter is mounted there.
 */
const CRITICAL_ROUTES = [
	// Check
	{ method: "POST", url: "/check" },
	{ method: "POST", url: "/entitled" },

	// Track
	{ method: "POST", url: "/events" },
	{ method: "POST", url: "/track" },

	// Get or create customer
	{ method: "POST", url: "/customers" },
	{ method: "GET", url: "/customers/:customer_id" },

	// RPC equivalents
	{ method: "POST", url: "/balances.check" },
	{ method: "POST", url: "/balances.track" },
	{ method: "POST", url: "/customers.get_or_create" },
];

/** Swaps ctx.db to the critical pool for latency-sensitive endpoints. */
export const criticalDbMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const path = c.req.path.replace(/^\/v1/, "");
	const method = c.req.method;

	const isCritical = CRITICAL_ROUTES.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);

	if (isCritical) {
		const ctx = c.get("ctx");
		ctx.db = dbCritical;
	}

	await next();
};
