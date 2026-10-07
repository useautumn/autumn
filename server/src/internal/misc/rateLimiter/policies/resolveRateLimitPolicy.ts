import { matchRoute } from "@/honoMiddlewares/middlewareUtils";
import { RATE_LIMIT_POLICIES } from "./rateLimitPolicies";
import type { RateLimitPolicy } from "./types/rateLimitPolicy";
import type { RateLimitRequestCtx } from "./types/rateLimitRequestCtx";

const matchesPolicyRoutes = ({
	policy,
	method,
	path,
}: {
	policy: RateLimitPolicy;
	method: string;
	path: string;
}) =>
	policy.routes === "*" ||
	policy.routes.some((pattern) => matchRoute({ url: path, method, pattern }));

const appliesToRequest = ({
	policy,
	ctx,
}: {
	policy: RateLimitPolicy;
	ctx?: RateLimitRequestCtx;
}) => !policy.appliesTo || (!!ctx && policy.appliesTo({ ctx }));

export const resolveRateLimitPolicy = ({
	method,
	path,
	ctx,
}: {
	method: string;
	path: string;
	ctx?: RateLimitRequestCtx;
}): RateLimitPolicy => {
	const policy = RATE_LIMIT_POLICIES.find(
		(candidate) =>
			matchesPolicyRoutes({ policy: candidate, method, path }) &&
			appliesToRequest({ policy: candidate, ctx }),
	);
	if (!policy)
		throw new Error("RATE_LIMIT_POLICIES must end with a '*' policy");
	return policy;
};
