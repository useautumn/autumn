import {
	type AppEnv,
	deduplicateArray,
	type FullProduct,
	notNullish,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { ProductService } from "../../ProductService.js";

/**
 * Maps each variant in the copy set to its base plan's public id. A variant may
 * point at an older base version that isn't in the latest-version list, so
 * unresolved internal ids are looked up directly.
 */
export const resolveSourceBasePlanIds = async ({
	db,
	logger,
	fromProducts,
	fromProductsAll,
}: {
	db: DrizzleCli;
	logger: Logger;
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
		const source = fromProductsAll[0];
		for (const base of olderBaseVersions) {
			// listByInternalIds is unscoped; ignore rows outside the source org/env.
			if (base.org_id !== source?.org_id || base.env !== source?.env) continue;
			basePlanIdByInternalId.set(base.internal_id, base.id);
		}
	}

	const basePlanIdByVariantId = new Map<string, string>();
	for (const variant of variants) {
		const baseInternalProductId = variant.base_internal_product_id;
		if (!baseInternalProductId) continue;

		const basePlanId = basePlanIdByInternalId.get(baseInternalProductId);
		if (!basePlanId || basePlanId === variant.id) {
			logger.warn(
				`copy env: ${variant.id} base could not be resolved, copying as a standalone plan`,
			);
			continue;
		}
		basePlanIdByVariantId.set(variant.id, basePlanId);
	}
	return basePlanIdByVariantId;
};

/**
 * Resolves base plan public ids to internal ids in the target env, after bases
 * have been copied. Absent ids and target rows that are themselves variants
 * are excluded so a copy never produces a dangling or nested variant link.
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
	const targetBases = await Promise.all(
		basePlanIds.map((planId) =>
			ProductService.get({ db, id: planId, orgId: toOrgId, env: toEnv }),
		),
	);

	return new Map(
		targetBases
			.filter((base) => base !== undefined)
			.filter((base) => base.base_internal_product_id === null)
			.map((base) => [base.id, base.internal_id]),
	);
};
