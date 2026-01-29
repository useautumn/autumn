import {
	type AppEnv,
	type Checkout,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { StatusCodes } from "http-status-codes";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { OrgService } from "@/internal/orgs/OrgService";
import { getCheckoutCache } from "../actions/cache";

/**
 * Rate limiter: 10 requests per minute per checkout ID.
 * Prevents enumeration attacks on checkout URLs.
 */
export const checkoutRateLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000, // 1 minute
	limit: 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) => c.req.param("checkout_id") ?? "unknown",
});

// Extend HonoEnv to include checkout in context
declare module "hono" {
	interface ContextVariableMap {
		checkout: Checkout;
	}
}

/**
 * Middleware to fetch checkout from cache and set up context.
 * - Fetches checkout from cache
 * - Loads org and features for the checkout's org_id
 * - Sets up ctx with org/env/features for handlers
 */
export const checkoutMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const checkoutId = c.req.param("checkout_id");

	if (!checkoutId) {
		throw new RecaseError({
			message: "Checkout ID is required",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const checkout = await getCheckoutCache({ checkoutId });

	if (!checkout) {
		throw new RecaseError({
			message: "Checkout expired or not found",
		});
	}

	const ctx = c.get("ctx");
	const env = checkout.env as AppEnv;

	const orgWithFeatures = await OrgService.getWithFeatures({
		db: ctx.db,
		orgId: checkout.org_id,
		env,
	});

	if (!orgWithFeatures) {
		throw new RecaseError({
			message: "Organization not found",
		});
	}

	// Set up context with org/env/features for handlers
	c.set("ctx", {
		...ctx,
		org: orgWithFeatures.org,
		env,
		features: orgWithFeatures.features,
		isPublic: true,
		customerId: checkout.customer_id,
	});

	// Attach checkout to context for handlers
	c.set("checkout", checkout);

	await next();
};
