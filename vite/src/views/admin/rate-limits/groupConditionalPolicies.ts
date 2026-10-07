import type { RateLimitPolicySummary } from "./rateLimitTypes";

export type RateLimitPolicyGroup = {
	policy: RateLimitPolicySummary;
	conditional: RateLimitPolicySummary[];
};

const hasSameRoutes = (a: RateLimitPolicySummary, b: RateLimitPolicySummary) =>
	JSON.stringify(a.routes) === JSON.stringify(b.routes);

/** A `when` row nests under the plain row with the same routes; without one it stands alone. */
export const groupConditionalPolicies = ({
	policies,
}: {
	policies: RateLimitPolicySummary[];
}): RateLimitPolicyGroup[] => {
	const plainPolicies = policies.filter((policy) => !policy.when);
	const groups = plainPolicies.map((policy) => ({
		policy,
		conditional: [] as RateLimitPolicySummary[],
	}));

	for (const policy of policies.filter((candidate) => candidate.when)) {
		const parent = groups.find((group) => hasSameRoutes(group.policy, policy));
		if (parent) parent.conditional.push(policy);
		else groups.push({ policy, conditional: [] });
	}
	return groups;
};
