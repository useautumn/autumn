import {
	type AppEnv,
	type Checkout,
	CheckoutCompletedError,
	CheckoutExpiredError,
	CheckoutStatus,
	CheckoutUnavailableError,
	ErrCode,
	InternalError,
	RecaseError,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { StatusCodes } from "http-status-codes";
import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { checkoutActions } from "@/internal/checkouts/actions";
import { OrgService } from "@/internal/orgs/OrgService";
import { deleteCheckoutCache } from "../actions/cache";
import { checkoutRepo } from "../repos/checkoutRepo";

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
	const ctx = c.get("ctx");

	if (!checkoutId) {
		throw new RecaseError({
			message: "Checkout ID is required",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const markCheckoutExpired = async ({ checkout }: { checkout: Checkout }) => {
		await deleteCheckoutCache({ checkoutId: checkout.id });

		if (checkout.status !== CheckoutStatus.Expired) {
			await checkoutRepo.update({
				db: ctx.db,
				id: checkout.id,
				updates: {
					status: CheckoutStatus.Expired,
				},
			});
		}
	};

	const validateCheckoutAvailability = async ({
		checkout,
	}: {
		checkout: Checkout;
	}) => {
		if (checkout.status === CheckoutStatus.Completed) {
			await deleteCheckoutCache({ checkoutId: checkout.id });
			throw new CheckoutCompletedError();
		}

		if (
			checkout.status === CheckoutStatus.Expired ||
			checkout.expires_at < Date.now()
		) {
			await markCheckoutExpired({ checkout });
			throw new CheckoutExpiredError();
		}

		return checkout;
	};

	const checkout = await checkoutActions.getFromCacheOrDb({
		checkoutId,
		db: ctx.db,
	});

	if (!checkout) {
		throw new CheckoutUnavailableError();
	}

	const validCheckout = await validateCheckoutAvailability({ checkout });

	const env = validCheckout.env as AppEnv;

	const orgWithFeatures = await OrgService.getWithFeatures({
		db: ctx.db,
		orgId: validCheckout.org_id,
		env,
	});

	if (!orgWithFeatures) {
		throw new InternalError({
			message: `Organization ${validCheckout.org_id} not found`,
			code: ErrCode.InternalError,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}

	// Set up context with org/env/features for handlers
	c.set("ctx", {
		...ctx,
		org: orgWithFeatures.org,
		env,
		features: orgWithFeatures.features,
		isPublic: true,
		customerId: validCheckout.customer_id,
		redis: resolveRedisForCustomer({
			org: orgWithFeatures.org,
			customerId: validCheckout.customer_id,
		}),
	});

	// Attach checkout to context for handlers
	c.set("checkout", validCheckout);

	await next();
};
