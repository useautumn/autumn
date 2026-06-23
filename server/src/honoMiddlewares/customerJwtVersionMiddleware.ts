import { ApiVersion, ErrCode } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError from "@/utils/errorUtils.js";

/**
 * Customer JWTs are only valid on API v2.3+. This runs AFTER
 * apiVersionMiddleware because ctx.apiVersion isn't resolved yet inside the
 * auth gate (secretKeyMiddleware runs before apiVersionMiddleware).
 */
export const customerJwtVersionMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	if (ctx.isCustomerJwt && !ctx.apiVersion.gte(ApiVersion.V2_3)) {
		throw new RecaseError({
			message: "Customer tokens require API version 2.3 or higher",
			code: ErrCode.InvalidApiVersion,
			statusCode: 400,
		});
	}
	return next();
};
