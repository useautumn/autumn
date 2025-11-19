import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";
import { ADMIN_USER_IDs } from "@/utils/constants.js";

/**
 * Admin auth middleware for Hono
 * Validates that the user is an admin user
 */
export const adminAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const data = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (
		!ADMIN_USER_IDs.includes(data?.session?.userId || "") &&
		!ADMIN_USER_IDs.includes(data?.session?.impersonatedBy || "")
	) {
		throw new RecaseError({
			message: "Method not allowed",
			code: ErrCode.InvalidRequest,
			statusCode: 403,
		});
	}

	await next();
};
