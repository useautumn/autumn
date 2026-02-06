import { RedisStore } from "@hono-rate-limiter/redis";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { redis } from "@/external/redis/initRedis";
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

export const rateLimitFactory = ({
	limit,
	windowMs,
	notInRedis,
}: Pick<RateLimitConfig, "limit" | "windowMs" | "notInRedis">): ReturnType<
	typeof rateLimiter
> => {
	return rateLimiter({
		windowMs,
		limit,
		standardHeaders: "draft-6",
		keyGenerator: getRateLimitKeyFromContext,
		store: notInRedis
			? undefined
			: new RedisStore({
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
