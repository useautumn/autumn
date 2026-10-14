import { backfillProductVersionIdentityInTree } from "@/internal/products/productUtils/backfillProductVersionIdentity.js";
import { repairCachedProductCollections } from "../../repairCachedProductCollections.js";
import {
	type CachedFullSubject,
	CachedFullSubjectSchema,
} from "../fullSubjectCacheModel.js";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

export const sanitizeCachedFullSubject = ({
	cachedFullSubject,
}: {
	cachedFullSubject: CachedFullSubject;
}): CachedFullSubject => {
	backfillProductVersionIdentityInTree({ value: cachedFullSubject });

	const normalized = normalizeFromSchema<CachedFullSubject>({
		schema: CachedFullSubjectSchema,
		data: cachedFullSubject,
	});

	// Safeguard for product collection fields: Upstash cjson collapses `{}` to
	for (const product of normalized.products ?? []) {
		repairCachedProductCollections(product);
	}

	return normalized;
};
