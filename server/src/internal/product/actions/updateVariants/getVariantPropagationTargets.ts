import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const getVariantPropagationTargets = async ({
	ctx,
	oldBase,
	propagateToVariants,
	missingAllowedIds = new Set(),
}: {
	ctx: AutumnContext;
	oldBase: FullProduct;
	propagateToVariants: string[];
	missingAllowedIds?: Set<string>;
}): Promise<{
	variants: FullProduct[];
	allVariants: FullProduct[];
	missingVariantIds: string[];
}> => {
	if (propagateToVariants.length > 20) {
		throw new RecaseError({
			message: "Cannot propagate to more than 20 variants",
			code: ErrCode.TooManyVariants,
			statusCode: 400,
		});
	}

	const { db, org, env } = ctx;
	const family = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: [oldBase.id],
		returnAll: true,
	});

	const baseInternalProductIds = family.map((p) => p.internal_id);
	const variants = await ProductService.listVariantsByParent({
		db,
		baseInternalProductIds,
		orgId: org.id,
		env,
	});

	const allFamily = [...family, ...variants];
	const familyIds = new Set(allFamily.map((p) => p.id));
	const archivedIds = new Set(
		allFamily.filter((p) => p.archived).map((p) => p.id),
	);

	const targetProducts =
		propagateToVariants.length > 0
			? await ProductService.listFull({
					db,
					orgId: org.id,
					env,
					inIds: propagateToVariants,
					returnAll: true,
				})
			: [];

	const targetById = new Map(
		targetProducts.map((product) => [product.id, product]),
	);
	const baseInternalIdsSet = new Set(baseInternalProductIds);
	for (const product of targetProducts) {
		if (
			product.archived &&
			product.base_internal_product_id &&
			baseInternalIdsSet.has(product.base_internal_product_id)
		) {
			archivedIds.add(product.id);
			familyIds.add(product.id);
		}
	}

	const variantById = new Map(variants.map((variant) => [variant.id, variant]));
	const selectedVariants: FullProduct[] = [];
	const missingVariantIds: string[] = [];
	for (const id of propagateToVariants) {
		const target = targetById.get(id);
		if (!target) {
			if (missingAllowedIds.has(id)) {
				missingVariantIds.push(id);
				continue;
			}

			throw new RecaseError({
				message: `Invalid propagation target: ${id}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: 400,
			});
		}

		if (id === oldBase.id || !familyIds.has(id)) {
			throw new RecaseError({
				message: `Invalid propagation target: ${id}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: 400,
			});
		}
		if (archivedIds.has(id)) continue;

		const variant = variantById.get(id);
		if (variant) selectedVariants.push(variant);
	}

	return {
		variants: selectedVariants,
		allVariants: variants,
		missingVariantIds,
	};
};
