import { matchRoute } from "@/honoMiddlewares/middlewareUtils";
import { RATE_LIMIT_POLICIES } from "./rateLimitPolicies";
import type { RateLimitPolicy } from "./types/rateLimitPolicy";

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

export const resolveRateLimitPolicy = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): RateLimitPolicy => {
	const policy = RATE_LIMIT_POLICIES.find((candidate) =>
		matchesPolicyRoutes({ policy: candidate, method, path }),
	);
	if (!policy)
		throw new Error("RATE_LIMIT_POLICIES must end with a '*' policy");
	return policy;
};
