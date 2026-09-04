import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createRateLimitRedisStore } from "../rateLimitRedisStore.js";
import { getTrustedClientIp } from "./getTrustedClientIp.js";
import {
	PUBLIC_RATE_LIMIT_CONFIGS,
	PublicRateLimitScope,
	type PublicRateLimitType,
} from "./publicRateLimitConfigs.js";

export const createPublicRedisRateLimiter = ({
	type,
}: {
	type: PublicRateLimitType;
}) => {
	const config = PUBLIC_RATE_LIMIT_CONFIGS[type];
	let limiter: ReturnType<typeof rateLimiter<HonoEnv>> | null = null;

	const getRateLimitKey = async (c: Context<HonoEnv>) => {
		switch (config.scope) {
			case PublicRateLimitScope.Global:
				return `${config.name}:global`;
			case PublicRateLimitScope.Client:
				return `${config.name}:client:${getTrustedClientIp({ c })}`;
		}
	};

	const getLimiter = () => {
		limiter ??= rateLimiter<HonoEnv>({
			windowMs: config.windowMs,
			limit: config.limit,
			standardHeaders: false,
			store: createRateLimitRedisStore<HonoEnv>(),
			keyGenerator: getRateLimitKey,
			handler: (c) =>
				c.json(
					{
						message: "Request could not be completed",
						code: ErrCode.InvalidRequest,
					},
					429,
				),
		});
		return limiter;
	};

	return async (c: Context<HonoEnv>, next: Next) => {
		try {
			return await getLimiter()(c, next);
		} catch {
			limiter = null;
			throw new RecaseError({
				message: "Request could not be completed",
				code: ErrCode.RequestTemporarilyDisabled,
				statusCode: 503,
			});
		}
	};
};
