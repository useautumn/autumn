import { isOneOffProduct, type Price, prices } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * Caches one-off classification per internal product id for the lifetime of a
 * worker, so repeated pages never re-read the same catalog prices.
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

		const priceRows = await db
			.select({
				internal_product_id: prices.internal_product_id,
				config: prices.config,
			})
			.from(prices)
			.where(inArray(prices.internal_product_id, missing));

		const pricesByProduct = new Map<string, Price[]>();
		for (const priceRow of priceRows) {
			const existing = pricesByProduct.get(priceRow.internal_product_id) ?? [];
			existing.push(priceRow as unknown as Price);
			pricesByProduct.set(priceRow.internal_product_id, existing);
		}

		for (const internalProductId of missing) {
			isOneOffByInternalProductId.set(
				internalProductId,
				isOneOffProduct({
					prices: pricesByProduct.get(internalProductId) ?? [],
				}),
			);
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
