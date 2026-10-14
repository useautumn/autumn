import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";

export const adminAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const data = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

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
