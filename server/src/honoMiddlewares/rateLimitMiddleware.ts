import type { Context, Next } from "hono";
import { StatusCodes } from "http-status-codes";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { upstash } from "../external/upstash/initUpstash";
import {
	getRateLimiter,
	getRateLimitKey,
	getRateLimitType,
} from "../external/upstash/rateLimitUtils";

/**
 * Analytics middleware for Hono
 * Enriches logger context and logs responses
 */
export const rateLimitMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	if (!upstash) {
		await next();
		return;
	}

	const ctx = c.get("ctx");
	try {
		// 1. Check method.
		const rateLimitType = getRateLimitType(c);

		// 2. Get rate limit key
		const rateLimitKey = await getRateLimitKey({ c, rateLimitType });
		const rateLimiter = getRateLimiter({ rateLimitType });

		// 3. Check rate limit
		const result = await rateLimiter?.limit(rateLimitKey);

		if (!result?.success) {
			ctx.logger.warn(
				`${rateLimitType} - Rate limit exceeded: ${rateLimitKey}`,
			);
			return c.json(
				{ error: "Rate limit exceeded" },
				StatusCodes.TOO_MANY_REQUESTS,
			);
		}
	} catch (error) {
		ctx.logger.error(
			`Error checking rate limit, error: ${error}. Bypassing for now`,
		);
	}

	// 4. Execute the request
	await next();
};
