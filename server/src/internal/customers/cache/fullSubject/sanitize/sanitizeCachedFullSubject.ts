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
	const normalized = normalizeFromSchema<CachedFullSubject>({
		schema: CachedFullSubjectSchema,
		data: cachedFullSubject,
	});

	// Safeguard for product collection fields: Upstash cjson collapses `{}` to
	// `[]`, and pre-existing entries may lack the field entirely.
	for (const product of normalized.products ?? []) {
		repairCachedProductCollections(product);
	}

	backfillCachedProductActive(normalized);

	return normalized;
};

/**
 * Entries cached before the version-identity migration lack the (strict)
 * `active` field. Hole-fill it with the same rule as the DB backfill: a plan's
 * max-version row is the active one. Post-migration entries carry real values
 * and are left untouched.
 */
const backfillCachedProductActive = (normalized: CachedFullSubject) => {
	const products = normalized.products ?? [];

	const maxVersionByPlanId = new Map<string, number>();
	for (const product of products) {
		const max = maxVersionByPlanId.get(product.id) ?? 0;
		if (product.version > max)
			maxVersionByPlanId.set(product.id, product.version);
	}

	for (const product of products) {
		if (typeof product.active !== "boolean") {
			product.active = product.version === maxVersionByPlanId.get(product.id);
		}
	}
};
