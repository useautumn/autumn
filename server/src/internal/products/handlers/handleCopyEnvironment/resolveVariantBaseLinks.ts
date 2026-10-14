import { deduplicateArray, type FullProduct, notNullish } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "../../ProductService.js";
import { getActiveProducts } from "../../productUtils.js";

export const resolveSourceBasePlanIds = async ({
	ctx,
	fromProducts,
	fromProductsAll,
}: {
	ctx: AutumnContext;
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
}): Promise<Map<string, string>> => {
	const { db, logger } = ctx;
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

export const getTargetBaseInternalIds = async ({
	toContext,
	basePlanIds,
}: {
	toContext: AutumnContext;
	basePlanIds: string[];
}): Promise<Map<string, string>> => {
	const { db, org, env } = toContext;
	const targetBases = await ProductService.listByIds({
		db,
		orgId: org.id,
		env,
		ids: basePlanIds,
	});

	return new Map(
		getActiveProducts(targetBases)
			.filter((base) => base.base_internal_product_id === null)
			.map((base) => [base.id, base.internal_id]),
	);
};
