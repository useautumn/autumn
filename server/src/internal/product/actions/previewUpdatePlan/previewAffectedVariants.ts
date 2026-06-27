import type {
	DiffedCustomizePlanV1,
	FullProduct,
	PlanUpdatePreviewVariant,
	PreviewUpdatePlanParamsV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { applyDiffToVariantPlan } from "../common/planTransformUtils.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { hasPlanCustomers } from "./hasPlanCustomers.js";

export const previewAffectedVariants = async ({
	ctx,
	base,
	diff,
	data,
	previewCtx,
}: {
	ctx: AutumnContext;
	base: FullProduct;
	diff: DiffedCustomizePlanV1;
	data: PreviewUpdatePlanParamsV2;
	previewCtx: { expand: string[] };
}): Promise<PlanUpdatePreviewVariant[]> => {
	const { db, org, env, features } = ctx;

	const family = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: [base.id],
		returnAll: true,
	});

	const variants = await ProductService.listVariantsByParent({
		db,
		baseInternalProductIds: family.map((p) => p.internal_id),
		orgId: org.id,
		env,
	});

	return Promise.all(
		variants.map(async (variant) => {
			const currentPlan = await getPlanResponse({
				ctx,
				product: variant,
				features,
			});
			const previewPlan = applyDiffToVariantPlan({
				plan: currentPlan,
				diff,
			});
			const hasCustomers = await hasPlanCustomers({ ctx, product: variant });
			const versionable =
				data.force_version ||
				(!data.disable_version &&
					hasCustomers &&
					(diff.price !== undefined ||
						diff.add_items != null ||
						diff.remove_items != null ||
						diff.free_trial !== undefined));

			return {
				...buildCorePlanUpdatePreview({
					ctx: previewCtx,
					planId: variant.id,
					current: currentPlan,
					preview: previewPlan,
					hasCustomers,
					versionable,
				}),
				conflicts: [],
			};
		}),
	);
};
