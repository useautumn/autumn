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
import { deleteCheckoutCache } from "@/external/redis/actions/autumnCheckoutCache/autumnCheckoutCache.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { checkoutActions } from "@/internal/checkouts/actions";
import { OrgService } from "@/internal/orgs/OrgService";
import { checkoutRepo } from "../repos/checkoutRepo";

export const checkoutRateLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) => c.req.param("checkout_id") ?? "unknown",
});

declare module "hono" {
	interface ContextVariableMap {
		checkout: Checkout;
	}
}

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

	const nextCtx = {
		...ctx,
		org: orgWithFeatures.org,
		env,
		features: orgWithFeatures.features,
		isPublic: true,
		customerId: validCheckout.customer_id,
	};
	const { ctx: routedCtx } = getCtxWithCustomerRedis({ ctx: nextCtx });

	c.set("ctx", routedCtx);

	c.set("checkout", validCheckout);

	await next();
};
