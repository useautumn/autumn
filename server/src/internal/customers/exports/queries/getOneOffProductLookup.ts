import { isOneOffProduct, products } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	composeFullProductQuery,
	normalizeFullProductLicenses,
	type ProductWithLicenseRelations,
} from "@/internal/products/repos/utils/composeFullProductQuery.js";

/**
 * Caches one-off classification for the lifetime of an export so repeated
 * pages do not re-read the same catalog products.
 */
export const createOneOffProductLookup = ({ db }: { db: DrizzleCli }) => {
	const isOneOffByInternalProductId = new Map<string, boolean>();

	const loadMissing = async ({
		internalProductIds,
	}: {
		internalProductIds: string[];
	}) => {
		const missing = internalProductIds.filter(
			(id) => !isOneOffByInternalProductId.has(id),
		);
		if (missing.length === 0) return;

		// Full products (catalog prices + license products) so classification
		// matches isOneOffProduct({ product }) everywhere else.
		const rows = (await db.query.products.findMany({
			where: inArray(products.internal_id, missing),
			with: composeFullProductQuery({ excludeEnts: true }),
		})) as ProductWithLicenseRelations[];

		for (const row of rows) {
			const product = normalizeFullProductLicenses({ product: row });
			isOneOffByInternalProductId.set(
				row.internal_id,
				isOneOffProduct({ product }),
			);
		}

		for (const internalProductId of missing) {
			if (!isOneOffByInternalProductId.has(internalProductId)) {
				isOneOffByInternalProductId.set(internalProductId, false);
			}
		}
	};

	return {
		resolveOneOffInternalProductIds: async ({
			internalProductIds,
		}: {
			internalProductIds: string[];
		}): Promise<Set<string>> => {
			await loadMissing({ internalProductIds });

			return new Set(
				internalProductIds.filter(
					(id) => isOneOffByInternalProductId.get(id) === true,
				),
			);
		},
	};
};

export type OneOffProductLookup = ReturnType<typeof createOneOffProductLookup>;
