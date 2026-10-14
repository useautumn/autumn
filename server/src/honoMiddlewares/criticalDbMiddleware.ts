import type { Context, Next } from "hono";
import { dbCritical } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { matchRoute } from "./middlewareUtils.js";

const CRITICAL_ROUTES = [
	{ method: "POST", url: "/check" },
	{ method: "POST", url: "/entitled" },

	{ method: "POST", url: "/events" },
	{ method: "POST", url: "/track" },

	{ method: "POST", url: "/customers" },
	{ method: "GET", url: "/customers/:customer_id" },
	{ method: "GET", url: "/customers/:customer_id/entities/:entity_id" },

	{ method: "POST", url: "/balances.check" },
	{ method: "POST", url: "/balances.track" },
	{ method: "POST", url: "/balances.finalize" },
	{ method: "POST", url: "/customers.get" },
	{ method: "POST", url: "/customers.get_or_create" },
	{ method: "POST", url: "/entities.get" },
];

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
