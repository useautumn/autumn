import type { RateLimitPolicySummary } from "./rateLimitTypes";

export type RateLimitPolicyGroup = {
	policy: RateLimitPolicySummary;
	conditional: RateLimitPolicySummary[];
};

const coversRoutes = ({
	parent,
	child,
}: {
	parent: RateLimitPolicySummary;
	child: RateLimitPolicySummary;
}) =>
	parent.routes !== "*" &&
	child.routes !== "*" &&
	child.routes.length > 0 &&
	child.routes.every((route) => parent.routes.includes(route));

/** First match wins, so a row whose routes a later row covers only applies to some requests: it nests there. */
export const groupConditionalPolicies = ({
	policies,
}: {
	policies: RateLimitPolicySummary[];
}): RateLimitPolicyGroup[] => {
	const findParent = (index: number) =>
		policies
			.slice(index + 1)
			.find((parent) => coversRoutes({ parent, child: policies[index] }));

	const groups = new Map<string, RateLimitPolicyGroup>();
	policies.forEach((policy, index) => {
		if (findParent(index)) return;
		groups.set(policy.id, { policy, conditional: [] });
	});
	policies.forEach((policy, index) => {
		const parent = findParent(index);
		if (parent) groups.get(parent.id)?.conditional.push(policy);
	});
	return [...groups.values()];
};
