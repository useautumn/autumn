import {
	type AppEnv,
	deduplicateArray,
	type FullProduct,
	notNullish,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ProductService } from "../../ProductService.js";

/**
 * Maps each variant in the copy set to its base plan's public id. A variant may
 * point at an older base version that isn't in the latest-version list, so
 * unresolved internal ids are looked up directly.
 */
export const resolveSourceBasePlanIds = async ({
	db,
	fromProducts,
	fromProductsAll,
}: {
	db: DrizzleCli;
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
}): Promise<Map<string, string>> => {
	const basePlanIdByInternalId = new Map(
		fromProductsAll.map((product) => [product.internal_id, product.id]),
	);

	const variants = fromProducts.filter((product) =>
		notNullish(product.base_internal_product_id),
	);

	const missingInternalIds = deduplicateArray(
		variants
			.map((variant) => variant.base_internal_product_id)
			.filter(notNullish)
			.filter((internalId) => !basePlanIdByInternalId.has(internalId)),
	);
	if (missingInternalIds.length > 0) {
		const olderBaseVersions = await ProductService.listByInternalIds({
			db,
			internalIds: missingInternalIds,
		});
		for (const base of olderBaseVersions) {
			basePlanIdByInternalId.set(base.internal_id, base.id);
		}
	}

	const basePlanIdByVariantId = new Map<string, string>();
	for (const variant of variants) {
		const baseInternalProductId = variant.base_internal_product_id;
		if (!baseInternalProductId) continue;

		const basePlanId = basePlanIdByInternalId.get(baseInternalProductId);
		if (!basePlanId || basePlanId === variant.id) continue;
		basePlanIdByVariantId.set(variant.id, basePlanId);
	}
	return basePlanIdByVariantId;
};

/**
 * A selective copy may include a variant without its base; the base must exist
 * in the target env for the link to survive, so pull it into the copy set
 * unless the target already has it.
 */
export const withRequiredBases = ({
	fromProducts,
	fromProductsAll,
	toProducts,
	basePlanIdByVariantId,
}: {
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
	toProducts: FullProduct[];
	basePlanIdByVariantId: Map<string, string>;
}): FullProduct[] => {
	const includedIds = new Set(fromProducts.map((product) => product.id));
	const targetIds = new Set(toProducts.map((product) => product.id));
	const basePlanIds = deduplicateArray([...basePlanIdByVariantId.values()]);

	const requiredBases: FullProduct[] = [];
	for (const basePlanId of basePlanIds) {
		if (includedIds.has(basePlanId) || targetIds.has(basePlanId)) continue;

		const base = fromProductsAll.find((product) => product.id === basePlanId);
		if (!base) continue;

		requiredBases.push(base);
		includedIds.add(basePlanId);
	}

	return [...fromProducts, ...requiredBases];
};

/**
 * Resolves base plan public ids to internal ids in the target env, after bases
 * have been copied. Target rows that are themselves variants are excluded so a
 * copy never produces a nested variant link.
 */
export const getTargetBaseInternalIds = async ({
	db,
	toOrgId,
	toEnv,
	basePlanIds,
}: {
	db: DrizzleCli;
	toOrgId: string;
	toEnv: AppEnv;
	basePlanIds: string[];
}): Promise<Map<string, string>> => {
	if (basePlanIds.length === 0) return new Map();

	const targetBases = await ProductService.listFull({
		db,
		orgId: toOrgId,
		env: toEnv,
		inIds: basePlanIds,
		excludeEnts: true,
	});

	return new Map(
		targetBases
			.filter((base) => base.base_internal_product_id === null)
			.map((base) => [base.id, base.internal_id]),
	);
};
