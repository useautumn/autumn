import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { registerInFlightRequest } from "@/utils/memory/inFlightRequests.js";

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
