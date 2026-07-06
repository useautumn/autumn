import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	FullProduct,
	PlanUpdatePreviewVariant,
	PreviewUpdatePlanParamsV2,
	UpdateVariantParams,
} from "@autumn/shared";
import { planUpdatePreviewHasDiff } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	applyDiffToVariantPlan,
	omitVariantOwnedSettings,
	type VariantSettingsPatch,
} from "../common/planTransformUtils.js";
import { resolveVariantUpdateSource } from "../common/variantUpdateSource.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { detectVariantConflicts } from "./detectVariantConflicts.js";
import { getPlanCustomerUsage } from "./hasPlanCustomers.js";

const diffHasVersionableChanges = (diff: DiffedCustomizePlanV1): boolean =>
	diff.price !== undefined ||
	diff.add_items != null ||
	diff.remove_items != null ||
	diff.free_trial !== undefined;

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
	const variantSettingsPatch = settingsPatch
		? omitVariantOwnedSettings(settingsPatch)
		: undefined;
	const variantUpdateById = new Map(
		variantUpdates.map((variantUpdate) => [
			variantUpdate.variant_plan_id,
			variantUpdate,
		]),
	);
	const selectedVariantIds = new Set([
		...(data.update_variant_ids ?? []),
		...variantUpdateById.keys(),
	]);

	const family = await PlanService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: [base.id],
		returnAll: true,
	});

	const variants = await PlanService.listVariantsByParent({
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
	const previewVariants =
		data.include_versions || data.all_versions
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
			const variantUpdate = variantUpdateById.get(variant.id);
			const previewPlan = variantUpdate
				? {
						...applyDiffToVariantPlan({
							plan: editedBasePlan,
							diff: variantUpdate.customize,
						}),
						id: variant.id,
						name: variant.name,
					}
				: applyDiffToVariantPlan({
						plan: currentPlan,
						diff,
						settingsPatch: variantSettingsPatch,
					});
			const { hasCustomers, customerCount } = await getPlanCustomerUsage({
				ctx,
				product: variant,
			});
			const hasVersionableChanges =
				diffHasVersionableChanges(diff) ||
				(variantUpdate
					? diffHasVersionableChanges(variantUpdate.customize)
					: false);
			const forceVariantVersion =
				variantUpdate?.force_version ?? data.force_version;
			const disableVariantVersion =
				variantUpdate?.disable_version || data.disable_version;
			const versionable =
				(isLatestVersion && forceVariantVersion) ||
				(isLatestVersion &&
					!disableVariantVersion &&
					!data.all_versions &&
					hasCustomers &&
					hasVersionableChanges);
			const conflicts = detectVariantConflicts({
				currentBasePlan,
				editedBasePlan,
				diff,
				variantPlan: currentPlan,
				features,
			});
			const preview = buildCorePlanUpdatePreview({
				ctx,
				planId: variant.id,
				current: currentPlan,
				preview: previewPlan,
				hasCustomers,
				customerCount,
				versionable,
			});
			const willApply =
				selectedVariantIds.has(variant.id) &&
				(data.all_versions || isLatestVersion);
			const updateSource =
				data.all_versions || isLatestVersion
					? resolveVariantUpdateSource({
							currentCustomize: currentPlan.variant_details?.customize,
							incomingCustomize: variantUpdate?.customize,
							hasPreviewDiff: planUpdatePreviewHasDiff(preview),
						})
					: null;
			return {
				...preview,
				name: variant.name,
				version: variant.version,
				will_apply: willApply,
				...(updateSource ? { update_source: updateSource } : {}),
				conflicts,
			};
		}),
	);
};
