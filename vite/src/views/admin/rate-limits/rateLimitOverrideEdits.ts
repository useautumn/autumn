import type {
	RateLimitEndpointOverride,
	RateLimitOverrideLimits,
} from "./rateLimitTypes";

type OrgOverrides = RateLimitOverrideLimits[string];

/** Drops the org entirely once its last override is gone. */
const withOrgOverrides = ({
	orgs,
	orgKey,
	limits,
	endpoints,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
} & OrgOverrides): RateLimitOverrideLimits => {
	const { [orgKey]: _removed, ...rest } = orgs;
	const hasEndpoints = endpoints && Object.keys(endpoints).length > 0;
	if (Object.keys(limits).length === 0 && !hasEndpoints) return rest;
	return {
		...rest,
		[orgKey]: hasEndpoints ? { limits, endpoints } : { limits },
	};
};

export const withOverride = ({
	orgs,
	orgKey,
	layerName,
	value,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
	layerName: string;
	value: number;
}): RateLimitOverrideLimits => ({
	...orgs,
	[orgKey]: {
		...orgs[orgKey],
		limits: { ...orgs[orgKey]?.limits, [layerName]: value },
	},
});

export const withoutOverrides = ({
	orgs,
	orgKey,
	layerNames,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
	layerNames: string[];
}): RateLimitOverrideLimits =>
	withOrgOverrides({
		orgs,
		orgKey,
		limits: Object.fromEntries(
			Object.entries(orgs[orgKey]?.limits ?? {}).filter(
				([name]) => !layerNames.includes(name),
			),
		),
		endpoints: orgs[orgKey]?.endpoints,
	});

export const withEndpointOverride = ({
	orgs,
	orgKey,
	endpoint,
	override,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
	endpoint: string;
	override: RateLimitEndpointOverride;
}): RateLimitOverrideLimits => ({
	...orgs,
	[orgKey]: {
		limits: orgs[orgKey]?.limits ?? {},
		endpoints: { ...orgs[orgKey]?.endpoints, [endpoint]: override },
	},
});

export const withoutEndpointOverride = ({
	orgs,
	orgKey,
	endpoint,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
	endpoint: string;
}): RateLimitOverrideLimits => {
	const { [endpoint]: _removed, ...endpoints } = orgs[orgKey]?.endpoints ?? {};
	return withOrgOverrides({
		orgs,
		orgKey,
		limits: orgs[orgKey]?.limits ?? {},
		endpoints,
	});
};
