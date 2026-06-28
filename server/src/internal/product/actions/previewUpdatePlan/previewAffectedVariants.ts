import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	FullProduct,
	PlanUpdatePreviewVariant,
	PreviewUpdatePlanParamsV2,
	UpdateVariantParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	applyDiffToVariantPlan,
	type VariantSettingsPatch,
} from "../common/planTransformUtils.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { detectVariantConflicts } from "./detectVariantConflicts.js";
import { hasPlanCustomers } from "./hasPlanCustomers.js";

export const previewAffectedVariants = async ({
	ctx,
	base,
	diff,
	settingsPatch,
	editedBasePlan,
	data,
	variantUpdates = [],
}: {
	ctx: AutumnContext;
	base: FullProduct;
	diff: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
	editedBasePlan: ApiPlanV1;
	data: PreviewUpdatePlanParamsV2;
	variantUpdates?: UpdateVariantParams[];
}): Promise<PlanUpdatePreviewVariant[]> => {
	const { db, org, env, features } = ctx;
	const updateByVariantId = new Map(
		variantUpdates.map((variantUpdate) => [
			variantUpdate.variant_plan_id,
			variantUpdate.customize,
		]),
	);
	const selectedVariantIds = new Set([
		...(data.update_variant_ids ?? []),
		...updateByVariantId.keys(),
	]);

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
			const variantDiff = updateByVariantId.get(variant.id);
			const previewPlan = variantDiff
				? {
						...applyDiffToVariantPlan({
							plan: editedBasePlan,
							diff: variantDiff,
						}),
						id: variant.id,
						name: variant.name,
					}
				: applyDiffToVariantPlan({
						plan: currentPlan,
						diff,
						settingsPatch,
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
					ctx,
					planId: variant.id,
					current: currentPlan,
					preview: previewPlan,
					hasCustomers,
					versionable,
				}),
				name: variant.name,
				will_apply: selectedVariantIds.has(variant.id),
				conflicts: detectVariantConflicts({
					editedBasePlan,
					diff,
					variantPlan: currentPlan,
					features,
				}),
			};
		}),
	);
};
