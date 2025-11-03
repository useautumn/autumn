import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";

/**
 * General rate limiter for all API routes: 50k requests/second per organization
 */
export const generalRateLimiter = rateLimiter({
	windowMs: 1000, // 1 second
	limit: 100_000,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context<HonoEnv>) => {
		const ctx = c.var.ctx;
		if (!ctx?.org?.id) {
			return "anonymous";
		}
		return `org:${ctx.org.id}:${ctx.env}`;
	},
	handler: (c: Context<HonoEnv>) => {
		return c.json(
			{
				message: "Too many requests. Please try again later.",
				code: "rate_limit_exceeded",
			},
			429,
		);
	},
});

/**
 * Factory function to create customer-based rate limiters
 * Key format: customer_id:org_id:env
 */
const createCustomerRateLimiter = ({ limit }: { limit: number }) => {
	return rateLimiter({
		windowMs: 1000, // 1 second
		limit,

		standardHeaders: "draft-6",
		keyGenerator: async (c: Context<HonoEnv>) => {
			const ctx = c.var.ctx;

			// Try to get customer_id from request body
			let customerId: string | undefined;

			try {
				const bodyObj = await c.req.json();
				customerId = bodyObj?.customer_id;
			} catch {
				// If we can't parse the body, fall back to org-level limiting
			}

			if (!customerId || !ctx?.org?.id || !ctx?.env) {
				// Fall back to org-level limiting if customer info not available
				return ctx?.org?.id
					? `org:${ctx.org.id}:${ctx.env || "unknown"}`
					: "anonymous";
			}

			return `customer:${customerId}:${ctx.org.id}:${ctx.env}`;
		},
		handler: (c: Context<HonoEnv>) => {
			return c.json(
				{
					message: "Too many requests. Please try again later.",
					code: "rate_limit_exceeded",
				},
				429,
			);
		},
		// store: new RedisStore({
		// 	client: new Redis({
		// 		url: process.env.UPSTASH_URL!,
		// 		token: process.env.UPSTASH_TOKEN!,
		// 	}),
		// }),
	});
};

/**
 * Rate limiter for /track and /events endpoints: 1k requests/second per customer
 */
export const customerTrackRateLimiter = createCustomerRateLimiter({
	limit: 10_000,
});

/**
 * Rate limiter for /check and /entitled endpoints: 100k requests/second per customer
 */
export const customerCheckRateLimiter = createCustomerRateLimiter({
	limit: 100_000,
});
