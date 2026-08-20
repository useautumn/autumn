import { repairCachedProductCollections } from "../../repairCachedProductCollections.js";
import {
	type CachedFullSubject,
	CachedFullSubjectSchema,
} from "../fullSubjectCacheModel.js";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

/**
 * Repair a `CachedFullSubject` read from Redis so Upstash cjson null-drops
 * and empty-collection swaps are reversed before the value reaches downstream
 * consumers.
 */
export const sanitizeCachedFullSubject = ({
	cachedFullSubject,
}: {
	cachedFullSubject: CachedFullSubject;
}): CachedFullSubject => {
	// Must run BEFORE the walker: version_slug is nullable, so the walker
	// fills a missing key with null — after that, "absent" is no longer
	// distinguishable from a real value.
	backfillCachedProductVersionIdentity(cachedFullSubject);

	const normalized = normalizeFromSchema<CachedFullSubject>({
		schema: CachedFullSubjectSchema,
		data: cachedFullSubject,
	});

	// Safeguard for product collection fields: Upstash cjson collapses `{}` to
	// `[]`, and pre-existing entries may lack the field entirely.
	for (const product of normalized.products ?? []) {
		repairCachedProductCollections(product);
	}

	return normalized;
};

/**
 * Entries cached before the version-identity migration lack the (strict)
 * `version_slug` and `active` fields. Slug hole-fills to `v{version}` (same
 * rule as the DB backfill). `active` hole-fills to false: the cached subject
 * only holds this customer's product rows, not the plan's full version
 * history, so it cannot know which version is actually active — false is the
 * honest value.
 *
 * Fills ONLY when the key is absent — entries cached after the migration
 * carry real values and must pass through untouched (including explicit
 * null / false).
 */
const backfillCachedProductVersionIdentity = (cached: CachedFullSubject) => {
	// Pre-walker, products may still be cjson-mangled ({} instead of []).
	if (!Array.isArray(cached.products)) return;
	for (const product of cached.products) {
		if (product.version_slug === undefined) {
			product.version_slug = `v${product.version}`;
		}
		if (product.active === undefined) {
			product.active = false;
		}
	}
};
