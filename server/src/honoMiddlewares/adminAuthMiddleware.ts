import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";

/**
 * Admin auth middleware for Hono
 * Validates that the user has an "admin" role
 */
export const adminAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const data = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	// Check if user has admin role
	const isAdmin =
		data?.user?.role === "admin" || !!data?.session?.impersonatedBy;

	if (!isAdmin) {
		throw new RecaseError({
			message: "Forbidden - Admin access required",
			code: ErrCode.InvalidRequest,
			statusCode: 403,
		});
	}

	await next();
};
