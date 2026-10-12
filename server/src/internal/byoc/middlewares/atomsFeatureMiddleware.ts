import { ErrCode, RecaseError } from "@autumn/shared";
import { Autumn } from "autumn-js";
import type { MiddlewareHandler } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

export const ATOMS_FEATURE_ID = "atoms";

/** Fails open like the other gates on Autumn's own billing: no key, or an unreachable Autumn, allows. */
const orgHasAtoms = async ({ ctx }: { ctx: AutumnContext }) => {
	const override = ctx.testOptions?.atomsAccess;
	if (override !== undefined) return override;
	if (!process.env.AUTUMN_SECRET_KEY) return true;

	try {
		const { allowed } = await new Autumn().check({
			customerId: ctx.org.id,
			featureId: ATOMS_FEATURE_ID,
		});
		return allowed;
	} catch (error) {
		ctx.logger.warn("atoms check failed, allowing the request", { error });
		return true;
	}
};

/** Gates the customer-facing `byoc.*` routes; the Atom's own routes (atomRouter) stay open. */
export const atomsFeatureMiddleware: MiddlewareHandler<HonoEnv> = async (
	c,
	next,
) => {
	if (!(await orgHasAtoms({ ctx: c.get("ctx") }))) {
		throw new RecaseError({
			message:
				"Atom isn't included in your plan. Contact hey@useautumn.com to enable it.",
			code: ErrCode.FeatureLimitReached,
			statusCode: 403,
		});
	}
	await next();
};
