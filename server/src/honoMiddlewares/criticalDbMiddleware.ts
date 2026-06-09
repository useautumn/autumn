import type { Context, Next } from "hono";
import { enterCriticalDb } from "@/db/criticalDbAdmission.js";
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
	{ method: "GET", url: "/customers/:customer_id/entities/:entity_id" },

	// RPC equivalents
	{ method: "POST", url: "/balances.check" },
	{ method: "POST", url: "/balances.track" },
	{ method: "POST", url: "/balances.finalize" },
	{ method: "POST", url: "/customers.get_or_create" },
	{ method: "POST", url: "/entities.get" },
];

const ADMISSION_ROUTES = [
	{ method: "POST", url: "/customers" },
	{ method: "GET", url: "/customers/:customer_id" },
	{ method: "GET", url: "/customers/:customer_id/entities/:entity_id" },
	{ method: "POST", url: "/customers.get_or_create" },
	{ method: "POST", url: "/entities.get" },
];

export const criticalDbMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const path = c.req.path.replace(/^\/v1/, "");
	const method = c.req.method;

	const isCritical = CRITICAL_ROUTES.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);
	if (!isCritical) {
		await next();
		return;
	}

	const ctx = c.get("ctx");
	ctx.db = dbCritical;

	const gated = ADMISSION_ROUTES.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);
	if (!gated) {
		await next();
		return;
	}

	const release = enterCriticalDb();
	try {
		await next();
	} finally {
		release();
	}
};
