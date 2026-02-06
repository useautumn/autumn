import type { Context, Env, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getLimiterForType,
	getRateLimitKey,
	setRateLimitKeyInContext,
} from "@/internal/misc/rateLimiter/rateLimitFactory";
import {
	getRateLimitType,
	RateLimitType,
} from "../internal/misc/rateLimiter/rateLimitConfigs";

/**
 * In-memory rate limiting middleware for Hono
 * Uses different rate limits based on endpoint type (General, Track, Check)
 */
export const rateLimitMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	try {
		// 1. Determine rate limit type based on endpoint
		const rateLimitType = getRateLimitType(c);

		if (
			rateLimitType === RateLimitType.Attach &&
			(process.env.NODE_ENV === "development" ||
				process.env.NODE_ENV === "test") &&
			ctx.org?.id === process.env.TESTS_ORG_ID
		) {
			return await next();
		}

		// 2. Get rate limit key based on type
		const rateLimitKey = await getRateLimitKey({ c, rateLimitType });

		// 3. Store key in context for keyGenerator to access
		setRateLimitKeyInContext(c as Context, rateLimitKey);

		// 4. Get the appropriate limiter for this type
		const limiter = getLimiterForType(rateLimitType);

		// 5. Apply rate limiting
		return await limiter(c as Context<Env>, next);
	} catch (error) {
		ctx.logger.error(
			`Error checking rate limit, error: ${error}. Bypassing for now`,
		);
		return await next();
	}
};
