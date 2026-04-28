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

	// Safeguard for new product fields: Upstash Lua cjson collapses `{}` to `[]`,
	// and pre-existing cache entries may not have these fields at all.
	for (const product of normalized.products ?? []) {
		const productAsRecord = product as { config?: unknown };
		if (!productAsRecord.config || Array.isArray(productAsRecord.config)) {
			productAsRecord.config = {};
		}
	}

	return normalized;
};
