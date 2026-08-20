// Plan selections are encoded as value keys: "<planId>" (any version) or
// "<planId>:<version>" (a specific version). Version is therefore always bound
// to its plan — there is no standalone version field.
const PLAN_KEY_SEPARATOR = ":";

export type PlanSelection = { planId: string; version?: number };

export function parsePlanKey(key: string): PlanSelection {
	const normalized = key.trim();
	const separatorIndex = normalized.lastIndexOf(PLAN_KEY_SEPARATOR);
	if (separatorIndex === -1) return { planId: normalized };
	const version = Number.parseInt(normalized.slice(separatorIndex + 1), 10);
	if (Number.isNaN(version)) return { planId: normalized };
	return { planId: normalized.slice(0, separatorIndex), version };
}

export function makePlanKey({ planId, version }: PlanSelection): string {
	return version === undefined
		? planId
		: `${planId}${PLAN_KEY_SEPARATOR}${version}`;
}

export const normalizePlanKeys = (keys: string[]): string[] => [
	...new Set(keys.map((key) => key.trim()).filter(Boolean)),
];
