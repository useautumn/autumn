import type { Context, Env, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getLimiterForType,
	getRateLimitKey,
	setRateLimitKeyInContext,
} from "@/internal/misc/rateLimiter/rateLimitFactory";
import {
	getOrgAggregateType,
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
		const rateLimitKey = getRateLimitKey({ c, rateLimitType });

		// 3. Store key in context for keyGenerator to access
		setRateLimitKeyInContext(c as Context, rateLimitKey);

		// 4. Get the appropriate limiter for this type
		const limiter = getLimiterForType(rateLimitType);

		const aggregateType = getOrgAggregateType(rateLimitType);
		if (!aggregateType) {
			// 5. Apply rate limiting
			return await limiter(c as Context<Env>, next);
		}

		// 5. Org-aggregate limiter wraps the per-customer one; the key slot is
		// swapped between them since keyGenerator reads it at execution time.
		setRateLimitKeyInContext(
			c as Context,
			getRateLimitKey({ c, rateLimitType: aggregateType }),
		);
		const aggregateLimiter = getLimiterForType(aggregateType);

		let innerResponse: Response | undefined;
		const aggregateResponse = await aggregateLimiter(
			c as Context<Env>,
			async () => {
				setRateLimitKeyInContext(c as Context, rateLimitKey);
				innerResponse = (await limiter(c as Context<Env>, next)) ?? undefined;
			},
		);

		// hono-rate-limiter discards next()'s return, so re-surface an inner 429.
		return aggregateResponse ?? innerResponse;
	} catch (error) {
		ctx.logger.error(
			`Error checking rate limit, error: ${error}. Bypassing for now`,
		);
		return await next();
	}
};
