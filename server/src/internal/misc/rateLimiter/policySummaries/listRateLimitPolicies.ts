import {
	RATE_LIMIT_CONFIGS,
	RATE_LIMIT_ROUTE_GROUPS,
	RateLimitScope,
	RateLimitType,
} from "../rateLimitConfigs";
import type { RateLimitOverridesConfig } from "../rateLimitOverridesSchemas";
import { toRateLimitLayerSummary } from "./toRateLimitLayerSummary";
import type {
	RateLimitPolicyOverride,
	RateLimitPolicySummary,
} from "./types/rateLimitPolicySummary";

type PolicyRow = {
	type: RateLimitType;
	name?: string;
	routes: string[] | "*";
	overLimit?: "degrade";
};

const ALL_TYPES = Object.keys(RATE_LIMIT_CONFIGS) as RateLimitType[];

const isRouted = ({ type }: { type: RateLimitType }) =>
	RATE_LIMIT_ROUTE_GROUPS.some((group) => group.type === type);

const isAnOrgCap = ({ type }: { type: RateLimitType }) =>
	ALL_TYPES.some((other) => RATE_LIMIT_CONFIGS[other].orgLimit === type);

/** One row per route group, then limits chosen outside the route table, then the general fallback. */
const listRows = (): PolicyRow[] => [
	...RATE_LIMIT_ROUTE_GROUPS.map(({ type, name, patterns, overLimit }) => ({
		type,
		name,
		routes: patterns.map(({ method, url }) => `${method} ${url}`),
		overLimit,
	})),
	...ALL_TYPES.filter(
		(type) =>
			type !== RateLimitType.General &&
			!isRouted({ type }) &&
			!isAnOrgCap({ type }),
	).map((type) => ({ type, routes: [] })),
	{ type: RateLimitType.General, routes: "*" },
];

const toLayerTypes = ({ type }: { type: RateLimitType }) => {
	const config = RATE_LIMIT_CONFIGS[type];
	if (config.scope === RateLimitScope.Org) {
		return { perOrg: type, perCustomer: undefined };
	}
	return { perOrg: config.orgLimit, perCustomer: type };
};

const toRowIds = ({ rows }: { rows: PolicyRow[] }) =>
	rows.map(({ type, name }, index) => {
		if (name) return name;
		const earlierOfType = rows
			.slice(0, index)
			.filter((row) => row.type === type).length;
		return earlierOfType === 0 ? type : `${type}_${earlierOfType + 1}`;
	});

const listPolicyOverrides = ({
	perOrg,
	perCustomer,
	overrides,
}: {
	perOrg?: RateLimitType;
	perCustomer?: RateLimitType;
	overrides: RateLimitOverridesConfig;
}): RateLimitPolicyOverride[] =>
	Object.entries(overrides.orgs).flatMap(([orgKey, { limits }]) => {
		const override = {
			orgKey,
			perOrg: perOrg ? limits[perOrg] : undefined,
			perCustomer: perCustomer ? limits[perCustomer] : undefined,
		};
		const hasOverride =
			override.perOrg !== undefined || override.perCustomer !== undefined;
		return hasOverride ? [override] : [];
	});

/** RATE_LIMIT_CONFIGS and the route table as the admin page renders them, overrides joined by type. */
export const listRateLimitPolicies = ({
	overrides,
}: {
	overrides: RateLimitOverridesConfig;
}): RateLimitPolicySummary[] => {
	const rows = listRows();
	const ids = toRowIds({ rows });
	const layerTypesByRow = rows.map(({ type }) => toLayerTypes({ type }));

	return rows.map(({ type, routes, overLimit }, index) => {
		const { perOrg, perCustomer } = layerTypesByRow[index];
		const ownLayers = [perOrg, perCustomer].filter(Boolean);
		const sharesCounterWith = ids.filter((_, earlierIndex) => {
			if (earlierIndex >= index) return false;
			const earlier = layerTypesByRow[earlierIndex];
			return [earlier.perOrg, earlier.perCustomer].some(
				(layer) => layer && ownLayers.includes(layer),
			);
		});

		return {
			id: ids[index],
			type,
			routes,
			// The group's over-limit answer applies to the orgLimit cap only.
			perOrg: perOrg
				? toRateLimitLayerSummary({
						type: perOrg,
						overLimit: perCustomer ? overLimit : undefined,
					})
				: null,
			perCustomer: perCustomer
				? toRateLimitLayerSummary({ type: perCustomer })
				: null,
			sharesCounterWith,
			overrides: listPolicyOverrides({ perOrg, perCustomer, overrides }),
		};
	});
};
