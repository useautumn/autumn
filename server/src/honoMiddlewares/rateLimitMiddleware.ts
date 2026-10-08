import type { Context, Env, Next } from "hono";
import { shouldUseRedis } from "@/external/redis/initRedis";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	getLimiterForType,
	getOrgLimiterFor,
	getRateLimitKey,
	setRateLimitKeyInContext,
} from "@/internal/misc/rateLimiter/rateLimitFactory";
import { runOrgThenCustomerInOneTrip } from "@/internal/misc/rateLimiter/runOrgThenCustomerInOneTrip";
import {
	getRateLimitRouteGroup,
	RATE_LIMIT_CONFIGS,
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
		const { type: rateLimitType, overLimit } = getRateLimitRouteGroup(c);

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

		const orgLimit = getOrgLimiterFor({ type: rateLimitType, overLimit });
		if (!orgLimit) {
			// 5. Apply rate limiting
			return await limiter(c as Context<Env>, next);
		}

		// 5. The org limiter wraps the per-customer one; the key slot is
		// swapped between them since keyGenerator reads it at execution time.
		setRateLimitKeyInContext(
			c as Context,
			getRateLimitKey({ c, rateLimitType: orgLimit.type }),
		);
		const skipPrimaryLimiter =
			rateLimitType === RateLimitType.EntitiesList && !ctx.customerId;

		if (
			!skipPrimaryLimiter &&
			shouldUseRedis() &&
			RATE_LIMIT_CONFIGS[rateLimitType].store === "redis" &&
			RATE_LIMIT_CONFIGS[orgLimit.type].store === "redis"
		) {
			return await runOrgThenCustomerInOneTrip({
				c,
				next,
				type: rateLimitType,
				orgType: orgLimit.type,
				overLimit,
				key: rateLimitKey,
				orgKey: getRateLimitKey({ c, rateLimitType: orgLimit.type }),
			});
		}

		let innerResponse: Response | undefined;
		const aggregateResponse = await orgLimit.limiter(
			c as Context<Env>,
			async () => {
				if (skipPrimaryLimiter) {
					innerResponse = (await next()) ?? undefined;
					return;
				}
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
