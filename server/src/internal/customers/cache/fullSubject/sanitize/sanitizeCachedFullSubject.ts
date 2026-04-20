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
}): CachedFullSubject =>
	normalizeFromSchema<CachedFullSubject>({
		schema: CachedFullSubjectSchema,
		data: cachedFullSubject,
	});
