import type { RolloutOrg } from "../edge-config/rolloutTypes";
import type { RateLimitOrg, RateLimitOverridesView } from "./rateLimitTypes";

const countOrgOverrides = ({
	view,
	orgKey,
}: {
	view: RateLimitOverridesView;
	orgKey: string;
}) =>
	view.policies.filter((policy) =>
		policy.overrides.some((override) => override.orgKey === orgKey),
	).length + Object.keys(view.orgs[orgKey]?.endpoints ?? {}).length;

/** Orgs with overrides, most overridden first; unresolved keys show as themselves. */
export const listOverrideOrgs = ({
	view,
}: {
	view: RateLimitOverridesView;
}): RateLimitOrg[] =>
	Object.keys(view.orgs)
		.map((orgKey) => {
			const org = view.orgsByKey[orgKey];
			return {
				key: orgKey,
				id: org?.id ?? orgKey,
				name: org?.name ?? orgKey,
				slug: org?.slug ?? orgKey,
				overrideCount: countOrgOverrides({ view, orgKey }),
			};
		})
		.sort((a, b) => b.overrideCount - a.overrideCount);

/** A searched org reuses its override entry when it has one, so edits land on the stored key. */
export const toRateLimitOrg = ({
	org,
	overrideOrgs,
}: {
	org: RolloutOrg;
	overrideOrgs: RateLimitOrg[];
}): RateLimitOrg =>
	overrideOrgs.find(({ id }) => id === org.id) ?? {
		key: org.id,
		...org,
		overrideCount: 0,
	};

export const matchesOrgSearch = ({
	org,
	search,
}: {
	org: RateLimitOrg;
	search: string;
}) => {
	const term = search.trim().toLowerCase();
	return [org.name, org.slug, org.id].some((value) =>
		value.toLowerCase().includes(term),
	);
};
