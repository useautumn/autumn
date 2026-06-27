import {
	apiPlan,
	applyDiff,
	diffPlanV1,
	ErrCode,
	RecaseError,
	type FullProduct,
	type UpdatePlanParams,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateProduct } from "../../product/actions/updateProduct.js";
import { ProductService } from "../ProductService.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";

export async function handleUpdateVariants({
	ctx,
	oldBase,
	newBase,
	propagateToVariants,
}: {
	ctx: AutumnContext;
	oldBase: FullProduct;
	newBase: FullProduct;
	propagateToVariants: string[];
}) {
	if (propagateToVariants.length === 0) return;

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

	// listVariantsByParent excludes archived variants, so look up
	// propagate targets directly to find archived ones
	const targetProducts = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: propagateToVariants,
		returnAll: true,
	});

	const baseInternalIdsSet = new Set(baseInternalProductIds);
	for (const p of targetProducts) {
		if (
			p.archived &&
			p.base_internal_product_id &&
			baseInternalIdsSet.has(p.base_internal_product_id)
		) {
			archivedIds.add(p.id);
			familyIds.add(p.id);
		}
	}

	if (propagateToVariants.length > 20) {
		throw new RecaseError({
			message: "Cannot propagate to more than 20 variants",
			code: ErrCode.TooManyVariants,
			statusCode: 400,
		});
	}

	const selectedIds: string[] = [];
	for (const id of propagateToVariants) {
		if (id === oldBase.id || !familyIds.has(id)) {
			throw new RecaseError({
				message: `Invalid propagation target: ${id}`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: 400,
			});
		}
		if (archivedIds.has(id)) continue;
		selectedIds.push(id);
	}

	const apiPlanFromOldBase = await getPlanResponse({
		ctx,
		product: oldBase,
		features: ctx.features,
	});
	const apiPlanFromNewBase = await getPlanResponse({
		ctx,
		product: newBase,
		features: ctx.features,
	});

	const diff = diffPlanV1({
		from: apiPlanFromOldBase,
		to: apiPlanFromNewBase,
	});

	for (const id of selectedIds) {
		const variant = variants.find((v) => v.id === id);
		if (!variant) continue;

		// Variants follow the base's version choice. Versioning is forced only
		// when the base versioned — variants must re-pin to the new base
		// internal_id (base_internal_product_id is immutable per row). When the
		// base patches in place, variants patch in place too; existing customers
		// are updated via a migration, not a forced version bump.
		const shouldVersion = oldBase.internal_id !== newBase.internal_id;

		const apiPlanFromVariant = await getPlanResponse({
			ctx,
			product: variant,
			features: ctx.features,
		});

		const reconstructed = applyDiff({
			base: apiPlanFromVariant,
			diff,
		});

		const updates = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: variant,
			params: {
				id: variant.id,
				items: reconstructed.items,
				price: reconstructed.price,
				free_trial: reconstructed.free_trial,
			} as UpdatePlanParams,
		}) as UpdateProductV2Params;

		await updateProduct({
			ctx,
			productId: variant.id,
			query: shouldVersion
				? { force_version: true }
				: { disable_version: true },
			updates,
			initialFullProduct: variant,
			baseInternalProductId: shouldVersion
				? newBase.internal_id
				: undefined,
		});
	}
}
