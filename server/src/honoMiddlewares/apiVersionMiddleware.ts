import { ErrCode } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/initHono.js";
import RecaseError from "@/utils/errorUtils.js";
import { floatToVersion } from "@/utils/versionUtils.js";

/**
 * Middleware to verify and set API version from x-api-version header
 */
export const apiVersionMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const version = c.req.header("x-api-version");

	if (version) {
		const versionFloat = parseFloat(version);
		const apiVersion = floatToVersion(versionFloat);

		if (Number.isNaN(versionFloat) || !apiVersion) {
			throw new RecaseError({
				message: `${version} is not a valid API version`,
				code: ErrCode.InvalidApiVersion,
				statusCode: 400,
			});
		}

		// Store in context
		ctx.apiVersion = apiVersion.toString();
	}

	await next();
};
