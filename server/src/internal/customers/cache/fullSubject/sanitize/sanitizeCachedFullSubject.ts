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

	return normalized;
};
