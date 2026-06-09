import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createRateLimitRedisStore } from "@/internal/misc/rateLimiter/rateLimitRedisStore.js";

export const createRouterRateLimiter = ({
	keyPrefix,
	limit,
	windowMs,
}: {
	keyPrefix: string;
	limit: number;
	windowMs: number;
}) => {
	let limiter: ReturnType<typeof rateLimiter<HonoEnv>> | null = null;

	const getLimiter = () => {
		limiter ??= rateLimiter<HonoEnv>({
			windowMs,
			limit,
			standardHeaders: "draft-6",
			store: createRateLimitRedisStore<HonoEnv>(),
			keyGenerator: (c: Context<HonoEnv>) => {
				const ctx = c.get("ctx");
				return `${keyPrefix}:${ctx.org.id}:${ctx.env}:${c.req.path}`;
			},
		});

		return limiter;
	};

	return async (c: Context<HonoEnv>, next: Next) => {
		if (!shouldUseRedis()) return next();

		try {
			return await getLimiter()(c, next);
		} catch (error) {
			limiter = null;
			logger.error(`[router-rate-limit] Redis rate limit failed: ${error}`);
			return next();
		}
	};
};
