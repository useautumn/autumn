import type { ApiVersion } from "@autumn/shared";
import type { RateLimitOverridesConfig } from "../rateLimitOverridesSchemas";
import { getRateLimitKey } from "./getRateLimitKey";
import { RATE_LIMIT_POLICIES } from "./rateLimitPolicies";
import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitLayerScope } from "./types/rateLimitLayerScope";
import type { RateLimitLayerSummary } from "./types/rateLimitLayerSummary";
import type { RateLimitPolicy } from "./types/rateLimitPolicy";
import type {
	RateLimitPolicyOverride,
	RateLimitPolicySummary,
} from "./types/rateLimitPolicySummary";

const KEY_PLACEHOLDERS = {
	org: { id: "{orgId}" },
	env: "{env}",
	customerId: "{customerId}",
};

const toLayerSummary = ({
	layer,
	scope,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}): RateLimitLayerSummary => {
	const { limit } = layer;
	const isFixed = typeof limit === "number";
	return {
		name: layer.name,
		limit: isFixed ? limit : limit.otherwise,
		versionLimits: isFixed
			? []
			: Object.entries(limit.upTo).map(([upTo, versionLimit]) => ({
					upTo: upTo as ApiVersion,
					limit: versionLimit,
					key: getRateLimitKey({
						ctx: {
							...KEY_PLACEHOLDERS,
							apiVersion: { value: upTo as ApiVersion },
						},
						layer,
						scope,
					}),
				})),
		windowMs: layer.windowMs,
		counted: layer.counted ?? "allPods",
		overLimit: layer.overLimit ?? "reject",
		skipWithoutCustomerId: layer.skipWithoutCustomerId === true,
		key: getRateLimitKey({ ctx: KEY_PLACEHOLDERS, layer, scope }),
	};
};

const listLayerNames = ({ policy }: { policy: RateLimitPolicy }) =>
	[policy.perOrg?.name, policy.perCustomer?.name].filter(
		(name): name is string => name !== undefined,
	);

const listPolicyOverrides = ({
	policy,
	overrides,
}: {
	policy: RateLimitPolicy;
	overrides: RateLimitOverridesConfig;
}): RateLimitPolicyOverride[] =>
	Object.entries(overrides.orgs).flatMap(([orgKey, { limits }]) => {
		const perOrg = policy.perOrg ? limits[policy.perOrg.name] : undefined;
		const perCustomer = policy.perCustomer
			? limits[policy.perCustomer.name]
			: undefined;
		if (perOrg === undefined && perCustomer === undefined) return [];
		return [{ orgKey, perOrg, perCustomer }];
	});

/** The policy table as the admin page renders it, with each org's overrides joined by layer name. */
export const listRateLimitPolicies = ({
	overrides,
}: {
	overrides: RateLimitOverridesConfig;
}): RateLimitPolicySummary[] =>
	RATE_LIMIT_POLICIES.map((policy, index) => {
		const layerNames = listLayerNames({ policy });
		const sharesCounterWith = RATE_LIMIT_POLICIES.slice(0, index)
			.filter((earlier) =>
				listLayerNames({ policy: earlier }).some((name) =>
					layerNames.includes(name),
				),
			)
			.map((earlier) => earlier.id);

		return {
			id: policy.id,
			routes:
				policy.routes === "*"
					? "*"
					: policy.routes.map(({ method, url }) => `${method} ${url}`),
			perOrg: policy.perOrg
				? toLayerSummary({ layer: policy.perOrg, scope: "perOrg" })
				: null,
			perCustomer: policy.perCustomer
				? toLayerSummary({ layer: policy.perCustomer, scope: "perCustomer" })
				: null,
			sharesCounterWith,
			overrides: listPolicyOverrides({ policy, overrides }),
		};
	});
