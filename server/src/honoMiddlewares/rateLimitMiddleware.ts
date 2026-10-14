import type { Context, Env, Next } from "hono";
import { errorToResponse } from "@/honoMiddlewares/errorMiddleware/errorMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { isOverEndpointRateLimit } from "@/internal/misc/rateLimiter/isOverEndpointRateLimit";
import {
	getLimiterForType,
	getOrgLimiterFor,
	getRateLimitKey,
	orgRateLimitExceededError,
	setRateLimitKeyInContext,
} from "@/internal/misc/rateLimiter/rateLimitFactory";
import {
	getRateLimitRouteGroup,
	RateLimitType,
} from "../internal/misc/rateLimiter/rateLimitConfigs";

export const rateLimitMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	try {
		if (
			await isOverEndpointRateLimit({
				ctx,
				method: c.req.method,
				path: c.req.path,
			})
		) {
			return errorToResponse({
				c,
				error: orgRateLimitExceededError(),
				env: ctx.env,
			});
		}

		const { type: rateLimitType, overLimit } = getRateLimitRouteGroup(c);

		if (
			rateLimitType === RateLimitType.Attach &&
			(process.env.NODE_ENV === "development" ||
				process.env.NODE_ENV === "test") &&
			ctx.org?.id === process.env.TESTS_ORG_ID
		) {
			return await next();
		}

		const rateLimitKey = getRateLimitKey({ c, rateLimitType });

		setRateLimitKeyInContext(c as Context, rateLimitKey);

		const limiter = getLimiterForType(rateLimitType);

		const orgLimit = getOrgLimiterFor({ type: rateLimitType, overLimit });
		if (!orgLimit) {
			return await limiter(c as Context<Env>, next);
		}

		setRateLimitKeyInContext(
			c as Context,
			getRateLimitKey({ c, rateLimitType: orgLimit.type }),
		);
		const skipPrimaryLimiter =
			rateLimitType === RateLimitType.EntitiesList && !ctx.customerId;

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
