import type { ApiVersion } from "@autumn/shared";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import {
	RATE_LIMIT_CONFIGS,
	type RateLimitConfig,
	RateLimitScope,
	type RateLimitType,
	resolveRateLimit,
} from "./rateLimitConfigs";
import { getOrgRateLimitOverride } from "./rateLimitOverridesStore";
import { isCustomerInRedisAllowlist } from "./rateLimitRedisAllowlistStore";
import { createRateLimitRedisStore } from "./rateLimitRedisStore";

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
	type,
	config,
}: {
	type: RateLimitType;
	config: RateLimitConfig;
}): ReturnType<typeof rateLimiter> => {
	const { windowMs, notInRedis } = config;

	const dynamicLimit = (c: Context): number => {
		const ctx = (c as Context<HonoEnv>).get("ctx");
		const apiVersion = ctx?.apiVersion?.value as ApiVersion | undefined;
		const orgId = ctx?.org?.id;
		const orgSlug = ctx?.org?.slug;

		const override = getOrgRateLimitOverride({ orgId, orgSlug, type });
		if (override !== undefined) return override;

		return resolveRateLimit({ config, apiVersion }).limit;
	};

	const options = {
		windowMs,
		limit: dynamicLimit,
		standardHeaders: "draft-6" as const,
		keyGenerator: getRateLimitKeyFromContext,
	};

	let inMemoryLimiter: ReturnType<typeof rateLimiter> | null = null;
	let redisLimiter: ReturnType<typeof rateLimiter> | null = null;

	const getInMemoryLimiter = () => {
		inMemoryLimiter ??= rateLimiter(options);
		return inMemoryLimiter;
	};

	const getRedisLimiter = () => {
		redisLimiter ??= rateLimiter({
			...options,
			store: createRateLimitRedisStore(),
		});

		return redisLimiter;
	};

	return async (c, next) => {
		if (notInRedis) {
			const ctx = (c as Context<HonoEnv>).get("ctx");
			const customerId = ctx?.customerId;
			const isAllowlisted = isCustomerInRedisAllowlist({ customerId });

			if (!isAllowlisted) {
				return getInMemoryLimiter()(c, next);
			}
		}

		if (!shouldUseRedis()) {
			warnRateLimitBypass();
			return notInRedis ? getInMemoryLimiter()(c, next) : next();
		}

		return getRedisLimiter()(c, next);
	};
};

// Create rate limiters from central config
const limiters = Object.fromEntries(
	Object.entries(RATE_LIMIT_CONFIGS).map(([type, config]) => [
		type,
		rateLimitFactory({ type: type as RateLimitType, config }),
	]),
) as Record<RateLimitType, ReturnType<typeof rateLimiter>>;

export const getLimiterForType = (type: RateLimitType) => limiters[type];

export const getRateLimitKey = ({
	c,
	rateLimitType,
}: {
	c: Context<HonoEnv>;
	rateLimitType: RateLimitType;
}): string => {
	const ctx = c.get("ctx");
	const orgId = ctx.org?.id;
	const env = ctx.env;
	const apiVersion = ctx.apiVersion?.value as ApiVersion | undefined;

	const config = RATE_LIMIT_CONFIGS[rateLimitType];
	const { matchedKey } = resolveRateLimit({ config, apiVersion });
	const versionSuffix = matchedKey ? `:v${matchedKey}` : "";
	const baseKey = `${config.name}:${orgId}:${env}${versionSuffix}`;

	switch (config.scope) {
		case RateLimitScope.Org:
			return baseKey;

		case RateLimitScope.Customer:
		case RateLimitScope.CustomerWithUrlFallback:
			return `${baseKey}:${ctx.customerId}`;
	}
};
