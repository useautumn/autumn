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
	currentBasePlan,
	settingsPatch,
	editedBasePlan,
	data,
	variantUpdates = [],
}: {
	ctx: AutumnContext;
	base: FullProduct;
	diff: DiffedCustomizePlanV1;
	currentBasePlan: ApiPlanV1;
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
		returnAll: true,
	});
	variants.sort((a, b) => a.id.localeCompare(b.id) || b.version - a.version);
	const latestVersionById = new Map<string, number>();
	for (const variant of variants) {
		latestVersionById.set(
			variant.id,
			Math.max(latestVersionById.get(variant.id) ?? 0, variant.version),
		);
	}
	const previewVariants = data.include_versions || data.all_versions
		? variants
		: variants.filter(
				(variant) => variant.version === latestVersionById.get(variant.id),
			);

	return Promise.all(
		previewVariants.map(async (variant) => {
			const isLatestVersion =
				variant.version === latestVersionById.get(variant.id);
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
				(isLatestVersion && data.force_version) ||
				(isLatestVersion &&
					!data.disable_version &&
					!data.all_versions &&
					hasCustomers &&
					(diff.price !== undefined ||
						diff.add_items != null ||
						diff.remove_items != null ||
						diff.free_trial !== undefined));
			const conflicts = detectVariantConflicts({
				currentBasePlan,
				editedBasePlan,
				diff,
				variantPlan: currentPlan,
				features,
			});
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
				version: variant.version,
				will_apply:
					selectedVariantIds.has(variant.id) &&
					(data.all_versions || isLatestVersion),
				conflicts,
			};
		}),
	);
};
