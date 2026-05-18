import { type ApiVersion, ApiVersionClass } from "@autumn/shared";

export type VersionedMap<T> = { latest: T } & Partial<Record<ApiVersion, T>>;

/**
 * Picks the entry whose version key is the closest match to `requested`.
 * Resolution order:
 *   1. Exact version key match
 *   2. Smallest defined version >= requested (older clients map up)
 *   3. `latest` as fallback
 */
export const resolveVersionedEntry = <T>({
	map,
	requested,
}: {
	map: VersionedMap<T>;
	requested: ApiVersionClass;
}): T => {
	const exact = map[requested.value as ApiVersion];
	if (exact !== undefined) return exact;

	const defined = Object.keys(map)
		.filter((k): k is ApiVersion => k !== "latest")
		.map((v) => new ApiVersionClass(v))
		.sort((a, b) => (a.lt(b) ? -1 : 1));

	for (const v of defined) {
		if (requested.lte(v)) {
			const hit = map[v.value as ApiVersion];
			if (hit !== undefined) return hit;
		}
	}

	return map.latest;
};

/**
 * Throws if the key sets of two versioned maps differ.
 * Used at route registration time to catch versionedBody/versionedHandler drift.
 */
export const assertVersionedKeyParity = <A, B>({
	a,
	b,
	aName,
	bName,
}: {
	a: VersionedMap<A>;
	b: VersionedMap<B>;
	aName: string;
	bName: string;
}): void => {
	const keysA = new Set(Object.keys(a));
	const keysB = new Set(Object.keys(b));

	const missingFromB = [...keysA].filter((k) => !keysB.has(k));
	const missingFromA = [...keysB].filter((k) => !keysA.has(k));

	if (missingFromB.length === 0 && missingFromA.length === 0) return;

	const parts: string[] = [];
	if (missingFromB.length > 0) {
		parts.push(`${bName} is missing key(s): ${missingFromB.join(", ")}`);
	}
	if (missingFromA.length > 0) {
		parts.push(`${aName} is missing key(s): ${missingFromA.join(", ")}`);
	}
	throw new Error(
		`Version key parity violation between ${aName} and ${bName}: ${parts.join("; ")}`,
	);
};
