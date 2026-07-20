import {
	type ApiPlanLicenseV1,
	type ApiPlanV1,
	type FullProduct,
	type PlanUpdatePreviewLicenseChange,
	PlanUpdatePreviewLicenseChangeSchema,
	type PlanUpdatePreviewLicenseParent,
	PlanUpdatePreviewLicenseParentSchema,
	PlanUpdatePreviewPlanChangesSchema,
	type PreviewUpdatePlanParamsV2,
	planUpdatePreviewHasDiff,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { applyLicenseCustomizeToBasePlan } from "@/internal/licenses/actions/customize/rebaseCatalogPlanLicenses.js";
import {
	diffLicensePlanCustomize,
	toApiPlanLicenseWithCustomize,
} from "@/internal/licenses/actions/customize/toApiPlanLicenseWithCustomize.js";
import { listLicenseParentContexts } from "@/internal/licenses/actions/propagation/listLicenseParentContexts.js";
import {
	licenseParentTargetKey,
	resolveLicenseParentTargets,
} from "@/internal/licenses/actions/propagation/resolveLicenseParentTargets.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { getApiPlanDiff } from "../common/planTransformUtils.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { detectVariantConflicts } from "./detectVariantConflicts.js";

const buildLicenseChange = ({
	current,
	target,
	planChanges,
}: {
	current: ApiPlanLicenseV1;
	target: ApiPlanLicenseV1;
	planChanges: ReturnType<typeof buildCorePlanUpdatePreview>;
}): PlanUpdatePreviewLicenseChange => {
	const previousAttributes =
		current.version === target.version ? null : { version: current.version };
	const hasPlanChanges = planUpdatePreviewHasDiff(planChanges);

	return PlanUpdatePreviewLicenseChangeSchema.parse({
		...target,
		action: "update",
		previous_attributes: previousAttributes,
		plan_changes: hasPlanChanges
			? PlanUpdatePreviewPlanChangesSchema.parse(planChanges)
			: null,
	});
};

export const previewAffectedLicenseParents = async ({
	ctx,
	child,
	currentChildPlan,
	editedChildPlan,
	childWillVersion,
	data,
}: {
	ctx: AutumnContext;
	child: FullProduct;
	currentChildPlan: ApiPlanV1;
	editedChildPlan: ApiPlanV1;
	childWillVersion: boolean;
	data: PreviewUpdatePlanParamsV2;
}): Promise<PlanUpdatePreviewLicenseParent[]> => {
	const parentContexts = await listLicenseParentContexts({ ctx, child });
	const selectedContexts = resolveLicenseParentTargets({
		contexts: parentContexts,
		targets: data.update_license_parents ?? [],
		childPlanId: child.id,
	});
	if (parentContexts.length === 0) return [];
	const parentProducts = parentContexts.map(({ parent }) => parent);
	const latestVersionByPlanId = new Map<string, number>();
	for (const parent of parentProducts) {
		latestVersionByPlanId.set(
			parent.id,
			Math.max(latestVersionByPlanId.get(parent.id) ?? 0, parent.version),
		);
	}
	const usageByInternalId = await customerProductRepo.getVersioningUsage({
		db: ctx.db,
		internalProductIds: parentProducts.map((parent) => parent.internal_id),
	});
	const selectedTargets = new Set(
		selectedContexts.map(({ parent }) =>
			licenseParentTargetKey({
				planId: parent.id,
				version: parent.version,
			}),
		),
	);
	const childDiff = getApiPlanDiff({
		from: currentChildPlan,
		to: editedChildPlan,
	});

	const previews = await Promise.all(
		parentContexts.map(async ({ parent, link: currentLink }) => {
			const [parentPlan, currentEffectivePlan, currentLicense] =
				await Promise.all([
					getPlanResponse({
						ctx,
						product: parent,
						features: ctx.features,
					}),
					getPlanResponse({
						ctx,
						product: currentLink.product,
						features: ctx.features,
					}),
					toApiPlanLicenseWithCustomize({
						license: currentLink,
						resolvePlan: (product) =>
							getPlanResponse({
								ctx,
								product,
								features: ctx.features,
							}),
					}),
				]);
			const currentCustomize = getApiPlanDiff({
				from: currentChildPlan,
				to: currentEffectivePlan,
			});
			const targetEffectivePlan = currentLink.customized
				? applyLicenseCustomizeToBasePlan({
						basePlan: editedChildPlan,
						customize: currentCustomize,
					})
				: editedChildPlan;
			const targetCustomize = diffLicensePlanCustomize({
				basePlan: editedChildPlan,
				effectivePlan: targetEffectivePlan,
			});
			const targetLicense: ApiPlanLicenseV1 = {
				license_plan_id: child.id,
				version: childWillVersion ? child.version + 1 : child.version,
				included: currentLink.included,
				prepaid_only: currentLink.prepaid_only,
				...(targetCustomize ? { customize: targetCustomize } : {}),
			};
			const effectiveChanges = buildCorePlanUpdatePreview({
				ctx,
				planId: child.id,
				current: currentEffectivePlan,
				preview: targetEffectivePlan,
				hasCustomers: false,
				customerCount: 0,
				versionable: false,
			});
			const licenseChange = buildLicenseChange({
				current: currentLicense,
				target: targetLicense,
				planChanges: effectiveChanges,
			});
			const usage = usageByInternalId.get(parent.internal_id);
			const hasCustomers = usage?.hasVersionableCustomerProducts ?? false;
			const customerCount = usage?.versionableCustomerCount ?? 0;
			const isLatest = parent.version === latestVersionByPlanId.get(parent.id);
			const hasChanges =
				licenseChange.previous_attributes !== null ||
				licenseChange.plan_changes !== null;
			const versionable =
				(isLatest && data.force_version === true) ||
				(isLatest &&
					!data.disable_version &&
					!data.all_versions &&
					hasCustomers &&
					hasChanges);
			const parentCore = buildCorePlanUpdatePreview({
				ctx,
				planId: parent.id,
				current: parentPlan,
				preview: parentPlan,
				hasCustomers,
				customerCount,
				versionable,
			});

			return PlanUpdatePreviewLicenseParentSchema.parse({
				...parentCore,
				version: parent.version,
				name: parent.name,
				plan_license_id: currentLink.id,
				will_apply: selectedTargets.has(
					licenseParentTargetKey({
						planId: parent.id,
						version: parent.version,
					}),
				),
				update_source: "propagated",
				conflicts: detectVariantConflicts({
					currentBasePlan: currentChildPlan,
					editedBasePlan: editedChildPlan,
					diff: childDiff,
					variantPlan: currentEffectivePlan,
					features: ctx.features,
				}),
				license_changes: [licenseChange],
			});
		}),
	);

	return previews
		.filter(
			(preview): preview is PlanUpdatePreviewLicenseParent => preview !== null,
		)
		.sort(
			(a, b) => a.plan_id.localeCompare(b.plan_id) || b.version - a.version,
		);
};
