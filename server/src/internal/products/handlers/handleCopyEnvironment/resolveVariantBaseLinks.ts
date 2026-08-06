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
 * A selective copy may reference plans outside the copy set (variant bases,
 * licenses); each must exist in the target env for its link to survive, so
 * pull it into the copy set unless the target already has it.
 */
export const withRequiredPlans = ({
	fromProducts,
	fromProductsAll,
	toProducts,
	requiredPlanIds,
}: {
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
	toProducts: FullProduct[];
	requiredPlanIds: string[];
}): FullProduct[] => {
	const includedIds = new Set(fromProducts.map((product) => product.id));
	const targetIds = new Set(toProducts.map((product) => product.id));

	const requiredPlans: FullProduct[] = [];
	for (const planId of requiredPlanIds) {
		if (includedIds.has(planId) || targetIds.has(planId)) continue;

		const plan = fromProductsAll.find((product) => product.id === planId);
		if (!plan) continue;

		requiredPlans.push(plan);
		includedIds.add(planId);
	}

	return [...fromProducts, ...requiredPlans];
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
