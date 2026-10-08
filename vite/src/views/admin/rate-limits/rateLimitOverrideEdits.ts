import type { RateLimitOverrideLimits } from "./rateLimitTypes";

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
	[orgKey]: { limits: { ...orgs[orgKey]?.limits, [layerName]: value } },
});

/** Drops the org entirely once its last override is gone. */
export const withoutOverrides = ({
	orgs,
	orgKey,
	layerNames,
}: {
	orgs: RateLimitOverrideLimits;
	orgKey: string;
	layerNames: string[];
}): RateLimitOverrideLimits => {
	const limits = Object.fromEntries(
		Object.entries(orgs[orgKey]?.limits ?? {}).filter(
			([name]) => !layerNames.includes(name),
		),
	);
	const { [orgKey]: _removed, ...rest } = orgs;
	return Object.keys(limits).length === 0
		? rest
		: { ...rest, [orgKey]: { limits } };
};
