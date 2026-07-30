import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { registerInFlightRequest } from "@/utils/memory/inFlightRequests.js";

/**
 * Records which requests a process is serving so the memory spike probe can
 * name them. Identity is resolved lazily because auth runs after this.
 */
export const inFlightTrackingMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const release = registerInFlightRequest({
		startedAt: Date.now(),
		method: c.req.method,
		path: c.req.path,
		resolveIdentity: () => {
			const ctx = c.get("ctx");
			return {
				orgSlug: ctx?.org?.slug,
				customerId: ctx?.customerId,
			};
		},
	});

	try {
		await next();
	} finally {
		release();
	}
};
