import type { Context, Env, Next } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getLayerLimiter } from "@/internal/misc/rateLimiter/layerLimiter/getLayerLimiter";
import { resolveRateLimitPolicy } from "@/internal/misc/rateLimiter/policies/resolveRateLimitPolicy";
import type { RateLimitLayer } from "@/internal/misc/rateLimiter/policies/types/rateLimitLayer";

const isTestsOrgRequest = ({ ctx }: { ctx: AutumnContext }) => {
	const isTestEnv =
		process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
	return isTestEnv && ctx.org?.id === process.env.TESTS_ORG_ID;
};

/** The org limiter wraps the customer limiter, so both must pass. */
const runOrgThenCustomerLimiters = async ({
	c,
	next,
	perOrg,
	perCustomer,
}: {
	c: Context<HonoEnv>;
	next: Next;
	perOrg: RateLimitLayer;
	perCustomer: RateLimitLayer;
}) => {
	const ctx = c.get("ctx");
	const skipsCustomerLimiter =
		perCustomer.skipWithoutCustomerId === true && !ctx.customerId;
	const orgLimiter = getLayerLimiter({ layer: perOrg, scope: "perOrg" });
	const customerLimiter = getLayerLimiter({
		layer: perCustomer,
		scope: "perCustomer",
	});

	let innerResponse: Response | undefined;
	const orgResponse = await orgLimiter(c as Context<Env>, async () => {
		if (skipsCustomerLimiter) {
			innerResponse = (await next()) ?? undefined;
			return;
		}
		innerResponse =
			(await customerLimiter(c as Context<Env>, next)) ?? undefined;
	});

	// hono-rate-limiter discards next()'s return, so re-surface an inner 429.
	return orgResponse ?? innerResponse;
};

export const rateLimitMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	try {
		const policy = resolveRateLimitPolicy({
			method: c.req.method,
			path: c.req.path,
			ctx,
		});
		if (policy.skipForTestsOrg && isTestsOrgRequest({ ctx })) {
			return await next();
		}

		const { perOrg, perCustomer } = policy;
		if (perOrg && perCustomer) {
			return await runOrgThenCustomerLimiters({ c, next, perOrg, perCustomer });
		}
		if (perOrg) {
			return await getLayerLimiter({ layer: perOrg, scope: "perOrg" })(
				c as Context<Env>,
				next,
			);
		}
		if (perCustomer) {
			return await getLayerLimiter({
				layer: perCustomer,
				scope: "perCustomer",
			})(c as Context<Env>, next);
		}
		return await next();
	} catch (error) {
		ctx.logger.error(
			`Error checking rate limit, error: ${error}. Bypassing for now`,
		);
		return await next();
	}
};
