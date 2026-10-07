import type { ApiVersion } from "@autumn/shared";
import type { Context, Next } from "hono";
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

const CAP_EXCEEDED_WARNING_INTERVAL_MS = 10_000;
const lastCapWarnAtByType = new Map<string, number>();

const warnOrgCapExceeded = ({
	limitType,
	orgSlug,
}: {
	limitType: string;
	orgSlug?: string;
}) => {
	const now = Date.now();
	const lastWarnAt = lastCapWarnAtByType.get(limitType) ?? 0;
	if (now - lastWarnAt < CAP_EXCEEDED_WARNING_INTERVAL_MS) return;

	lastCapWarnAtByType.set(limitType, now);
	logger.warn(
		`[rate-limit] org aggregate cap exceeded: ${orgSlug ?? "unknown"} (${limitType})`,
		{ type: "org_rate_cap_exceeded", limitType, org: orgSlug },
	);
};

/** The limiter options for one bucket; every limiter for it, single or paired, is built from these. */
export const createRateLimitOptions = ({
	type,
	config,
	overLimit,
}: {
	type: RateLimitType;
	config: RateLimitConfig;
	overLimit?: "degrade";
}) => {
	const dynamicLimit = (c: Context): number => {
		const ctx = (c as Context<HonoEnv>).get("ctx");
		const apiVersion = ctx?.apiVersion?.value as ApiVersion | undefined;
		const orgId = ctx?.org?.id;
		const orgSlug = ctx?.org?.slug;

		const override = getOrgRateLimitOverride({ orgId, orgSlug, type });
		if (override !== undefined) return override;

		return resolveRateLimit({ config, apiVersion }).limit;
	};

	// The handler runs and decides what degraded means for its route.
	const degradeHandler = async (c: Context, next: Next): Promise<void> => {
		const ctx = (c as Context<HonoEnv>).get("ctx");
		warnOrgCapExceeded({ limitType: type, orgSlug: ctx?.org?.slug });
		if (ctx) ctx.orgRateLimitDegraded = true;
		c.header("Retry-After", undefined);
		await next();
	};

	return {
		windowMs: config.windowMs,
		limit: dynamicLimit,
		standardHeaders: "draft-6" as const,
		keyGenerator: getRateLimitKeyFromContext,
		...(overLimit === "degrade" && { handler: degradeHandler }),
	};
};

export const rateLimitFactory = ({
	type,
	config,
	overLimit,
}: {
	type: RateLimitType;
	config: RateLimitConfig;
	overLimit?: "degrade";
}): ReturnType<typeof rateLimiter> => {
	const options = createRateLimitOptions({ type, config, overLimit });

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
		if (config.store === "memory") return getInMemoryLimiter()(c, next);

		if (!shouldUseRedis()) {
			warnRateLimitBypass();
			return next();
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

// Route groups sharing an org counter can answer its cap differently, so each
// answer gets its own wrapper over the same Redis key.
const orgLimiters = new Map<string, ReturnType<typeof rateLimiter>>();

export const getOrgLimiterFor = ({
	type,
	overLimit,
}: {
	type: RateLimitType;
	overLimit?: "degrade";
}) => {
	const orgLimit = RATE_LIMIT_CONFIGS[type].orgLimit;
	if (!orgLimit) return undefined;

	const cacheKey = `${orgLimit}:${overLimit ?? "reject"}`;
	let limiter = orgLimiters.get(cacheKey);
	if (!limiter) {
		limiter = rateLimitFactory({
			type: orgLimit,
			config: RATE_LIMIT_CONFIGS[orgLimit],
			overLimit,
		});
		orgLimiters.set(cacheKey, limiter);
	}
	return { type: orgLimit, limiter };
};

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
	const baseKey = `${rateLimitType}:${orgId}:${env}${versionSuffix}`;

	if (config.scope === RateLimitScope.Org) return baseKey;
	return `${baseKey}:${ctx.customerId}`;
};
