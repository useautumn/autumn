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

const ALL_TYPES = Object.keys(RATE_LIMIT_CONFIGS) as RateLimitType[];

const listRoutes = ({ type }: { type: RateLimitType }) => {
	if (type === RateLimitType.General) return "*" as const;
	const group = RATE_LIMIT_ROUTE_GROUPS.find((entry) => entry.type === type);
	return (group?.patterns ?? []).map(({ method, url }) => `${method} ${url}`);
};

/** A type is its own row unless it is only ever some other limit's org cap. */
const isOnlyAnOrgCap = ({ type }: { type: RateLimitType }) => {
	const isRouted = RATE_LIMIT_ROUTE_GROUPS.some((entry) => entry.type === type);
	const capsAnother = ALL_TYPES.some(
		(other) => RATE_LIMIT_CONFIGS[other].orgLimit === type,
	);
	return capsAnother && !isRouted;
};

/** Rows in config order, with the general fallback last. */
const listRowTypes = () =>
	ALL_TYPES.filter((type) => !isOnlyAnOrgCap({ type })).sort(
		(a, b) =>
			Number(a === RateLimitType.General) - Number(b === RateLimitType.General),
	);

const toLayerTypes = ({ type }: { type: RateLimitType }) => {
	const config = RATE_LIMIT_CONFIGS[type];
	if (config.scope === RateLimitScope.Org) {
		return { perOrg: type, perCustomer: undefined };
	}
	return { perOrg: config.orgLimit, perCustomer: type };
};

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
	const rowTypes = listRowTypes();
	const layerTypesByRow = rowTypes.map((type) => toLayerTypes({ type }));

	return rowTypes.map((type, index) => {
		const { perOrg, perCustomer } = layerTypesByRow[index];
		const ownLayers = [perOrg, perCustomer].filter(Boolean);
		const sharesCounterWith = rowTypes.filter((_, earlierIndex) => {
			if (earlierIndex >= index) return false;
			const earlier = layerTypesByRow[earlierIndex];
			return [earlier.perOrg, earlier.perCustomer].some(
				(layer) => layer && ownLayers.includes(layer),
			);
		});

		return {
			id: type,
			routes: listRoutes({ type }),
			perOrg: perOrg ? toRateLimitLayerSummary({ type: perOrg }) : null,
			perCustomer: perCustomer
				? toRateLimitLayerSummary({ type: perCustomer })
				: null,
			sharesCounterWith,
			overrides: listPolicyOverrides({ perOrg, perCustomer, overrides }),
		};
	});
};
