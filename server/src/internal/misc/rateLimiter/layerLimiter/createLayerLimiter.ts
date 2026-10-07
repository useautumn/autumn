import type { ApiVersion } from "@autumn/shared";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { getRateLimitKey } from "../policies/getRateLimitKey";
import { resolveLayerLimit } from "../policies/resolveLayerLimit";
import type { RateLimitLayer } from "../policies/types/rateLimitLayer";
import type { RateLimitLayerScope } from "../policies/types/rateLimitLayerScope";
import { getOrgRateLimitOverride } from "../rateLimitOverridesStore";
import { isCustomerInRedisAllowlist } from "../rateLimitRedisAllowlistStore";
import { createRateLimitRedisStore } from "../rateLimitRedisStore";
import { getLayerOverLimitHandler } from "./layerOverLimitHandlers";

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

export const createLayerLimiter = ({
	layer,
	scope,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}): ReturnType<typeof rateLimiter> => {
	const countedPerPod = layer.counted === "perPod";

	const getLimit = (c: Context): number => {
		const ctx = (c as Context<HonoEnv>).get("ctx");
		const override = getOrgRateLimitOverride({
			orgId: ctx?.org?.id,
			orgSlug: ctx?.org?.slug,
			type: layer.name,
		});
		if (override !== undefined) return override;

		const apiVersion = ctx?.apiVersion?.value as ApiVersion | undefined;
		return resolveLayerLimit({ layer, apiVersion }).limit;
	};

	const getKey = (c: Context): string =>
		getRateLimitKey({ ctx: (c as Context<HonoEnv>).get("ctx"), layer, scope });

	const overLimitHandler = getLayerOverLimitHandler({ layer });
	const options = {
		windowMs: layer.windowMs,
		limit: getLimit,
		standardHeaders: "draft-6" as const,
		keyGenerator: getKey,
		...(overLimitHandler && { handler: overLimitHandler }),
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
		if (countedPerPod) {
			const customerId = (c as Context<HonoEnv>).get("ctx")?.customerId;
			if (!isCustomerInRedisAllowlist({ customerId })) {
				return getInMemoryLimiter()(c, next);
			}
		}

		if (!shouldUseRedis()) {
			warnRateLimitBypass();
			return countedPerPod ? getInMemoryLimiter()(c, next) : next();
		}

		return getRedisLimiter()(c, next);
	};
};
