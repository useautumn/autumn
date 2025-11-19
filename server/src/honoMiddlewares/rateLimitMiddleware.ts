import type { Context, Env, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { RateLimitType } from "../external/upstash/initUpstash";
import {
	CHECK_RATE_LIMIT,
	GENERAL_RATE_LIMIT,
	TRACK_RATE_LIMIT,
} from "../external/upstash/rateLimitConstants";
import {
	getRateLimitKey,
	getRateLimitType,
} from "../external/upstash/rateLimitUtils";

/**
 * In-memory rate limiting middleware for Hono
 * Uses different rate limits based on endpoint type (General, Track, Check)
 */

// Create single rate limiters that share the same in-memory store
const generalLimiter = rateLimiter({
	windowMs: 1000,
	limit: GENERAL_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (c) =>
		(c as Context & { rateLimitKey?: string }).rateLimitKey ?? "unknown",
});

const trackLimiter = rateLimiter({
	windowMs: 1000,
	limit: TRACK_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (c) =>
		(c as Context & { rateLimitKey?: string }).rateLimitKey ?? "unknown",
});

const checkLimiter = rateLimiter({
	windowMs: 1000,
	limit: CHECK_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (c) =>
		(c as Context & { rateLimitKey?: string }).rateLimitKey ?? "unknown",
});

const getLimiterForType = (type: RateLimitType) => {
	switch (type) {
		case RateLimitType.General:
			return generalLimiter;
		case RateLimitType.Track:
			return trackLimiter;
		case RateLimitType.Check:
			return checkLimiter;
	}
};

export const rateLimitMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	try {
		// 1. Determine rate limit type based on endpoint
		const rateLimitType = getRateLimitType(c);

		// 2. Get rate limit key based on type
		const rateLimitKey = await getRateLimitKey({ c, rateLimitType });

		// 3. Store key in context for keyGenerator to access
		(c as Context & { rateLimitKey: string }).rateLimitKey = rateLimitKey;

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
