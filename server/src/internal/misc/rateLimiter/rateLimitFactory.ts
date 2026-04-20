import { RedisStore } from "@hono-rate-limiter/redis";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis, shouldUseRedis } from "@/external/redis/initRedis";
import {
	parseCustomerIdFromBody,
	parseCustomerIdFromUrl,
} from "@/honoMiddlewares/analyticsMiddleware";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import {
	RATE_LIMIT_CONFIGS,
	type RateLimitConfig,
	RateLimitScope,
	type RateLimitType,
} from "./rateLimitConfigs";

// Helper to get rate limit key from context
const getRateLimitKeyFromContext = (c: Context): string => {
	return (c as Context & { rateLimitKey?: string }).rateLimitKey ?? "unknown";
};

// Helper to set rate limit key in context
export const setRateLimitKeyInContext = (c: Context, key: string): void => {
	(c as Context & { rateLimitKey: string }).rateLimitKey = key;
};

const RATE_LIMIT_WARNING_INTERVAL_MS = 30_000;
let lastRateLimitBypassWarningAt = 0;

const warnRateLimitBypass = () => {
	const now = Date.now();
	if (now - lastRateLimitBypassWarningAt < RATE_LIMIT_WARNING_INTERVAL_MS)
		return;

	lastRateLimitBypassWarningAt = now;
	logger.warn(
		"[rate-limit] Redis unavailable; bypassing distributed rate limiting",
	);
};

export const rateLimitFactory = ({
	limit,
	windowMs,
	notInRedis,
}: Pick<RateLimitConfig, "limit" | "windowMs" | "notInRedis">): ReturnType<
	typeof rateLimiter
> => {
	const options = {
		windowMs,
		limit,
		standardHeaders: "draft-6" as const,
		keyGenerator: getRateLimitKeyFromContext,
	};

	if (notInRedis) {
		return rateLimiter(options);
	}

	let redisLimiter: ReturnType<typeof rateLimiter> | null = null;

	return async (c, next) => {
		if (!shouldUseRedis()) {
			// Distributed rate limiting depends on Redis. In degraded mode we fail open.
			warnRateLimitBypass();
			return next();
		}

		redisLimiter ??= rateLimiter({
			...options,
			store: new RedisStore({
				client: {
					scriptLoad: (script: string) =>
						redis.script("LOAD", script) as Promise<string>,
					evalsha: <TArgs extends unknown[], TData = unknown>(
						sha: string,
						keys: string[],
						args: TArgs,
					): Promise<TData> => {
						return redis.evalsha(
							sha,
							keys.length,
							...keys,
							...(args as (string | number | Buffer)[]),
						) as Promise<TData>;
					},
					decr: (key: string) => redis.decr(key),
					del: (key: string) => redis.del(key),
				},
			}),
		});

		return redisLimiter(c, next);
	};
};

// Create rate limiters from central config
const limiters = Object.fromEntries(
	Object.entries(RATE_LIMIT_CONFIGS).map(([type, config]) => [
		type,
		rateLimitFactory(config),
	]),
) as Record<RateLimitType, ReturnType<typeof rateLimiter>>;

export const getLimiterForType = (type: RateLimitType) => limiters[type];

export const getRateLimitKey = async ({
	c,
	rateLimitType,
}: {
	c: Context<HonoEnv>;
	rateLimitType: RateLimitType;
}): Promise<string> => {
	const ctx = c.get("ctx");
	const orgId = ctx.org?.id;
	const env = ctx.env;

	const config = RATE_LIMIT_CONFIGS[rateLimitType];
	const baseKey = `${config.name}:${orgId}:${env}`;

	switch (config.scope) {
		case RateLimitScope.Org:
			return baseKey;

		case RateLimitScope.Customer: {
			const res = await parseCustomerIdFromBody(c);
			return `${baseKey}:${res?.customerId}`;
		}

		case RateLimitScope.CustomerWithUrlFallback: {
			const res = await parseCustomerIdFromBody(c);
			const urlCustomerId = parseCustomerIdFromUrl({ url: c.req.path });
			const customerId = res?.customerId || urlCustomerId;
			return `${baseKey}:${customerId}`;
		}
	}
};
