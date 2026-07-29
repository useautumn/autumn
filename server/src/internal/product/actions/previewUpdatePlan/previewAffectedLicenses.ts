import {
	type ApiPlanLicenseV1,
	type FullProduct,
	type PlanUpdatePreviewLicenseChange,
	PlanUpdatePreviewLicenseChangeSchema,
	PlanUpdatePreviewPlanChangesSchema,
	planUpdatePreviewHasDiff,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	diffLicensePlanCustomize,
	toApiPlanLicenseWithCustomize,
} from "@/internal/licenses/actions/customize/toApiPlanLicenseWithCustomize.js";
import type { ResolvedPlanLicenseLink } from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";

type StructuralLicenseChange = {
	action: "create" | "update" | "remove";
	license_plan_id: string;
};

const diffLinkPreviousAttributes = ({
	current,
	target,
}: {
	current: ApiPlanLicenseV1;
	target: ApiPlanLicenseV1;
}): PlanUpdatePreviewLicenseChange["previous_attributes"] => {
	const previous: NonNullable<
		PlanUpdatePreviewLicenseChange["previous_attributes"]
	> = {};
	if (current.version !== target.version) previous.version = current.version;
	if (current.included !== target.included)
		previous.included = current.included;
	if (current.prepaid_only !== target.prepaid_only) {
		previous.prepaid_only = current.prepaid_only;
	}
	return Object.keys(previous).length > 0 ? previous : null;
};

export const previewAffectedLicenses = async ({
	ctx,
	currentParentProduct,
	resolved,
	structuralChanges,
}: {
	ctx: AutumnContext;
	currentParentProduct: FullProduct;
	resolved: ResolvedPlanLicenseLink[];
	structuralChanges: StructuralLicenseChange[];
}): Promise<PlanUpdatePreviewLicenseChange[]> => {
	const currentLinkByPlanId = new Map<
		string,
		NonNullable<FullProduct["licenses"]>[number]
	>();
	for (const link of currentParentProduct.licenses ?? []) {
		currentLinkByPlanId.set(link.product.id, link);
	}
	const resolvedByPlanId = new Map<string, ResolvedPlanLicenseLink>();
	for (const link of resolved) {
		resolvedByPlanId.set(link.licenseProduct.id, link);
	}
	const structuralByPlanId = new Map<string, StructuralLicenseChange>();
	for (const change of structuralChanges) {
		structuralByPlanId.set(change.license_plan_id, change);
	}
	const candidatePlanIds = new Set([
		...structuralByPlanId.keys(),
		...resolvedByPlanId.keys(),
	]);
	const changes: PlanUpdatePreviewLicenseChange[] = [];

	for (const licensePlanId of candidatePlanIds) {
		const currentLink = currentLinkByPlanId.get(licensePlanId);
		const targetLink = resolvedByPlanId.get(licensePlanId);
		const structuralChange = structuralByPlanId.get(licensePlanId);

		if (!targetLink) {
			if (!currentLink || structuralChange?.action !== "remove") continue;
			const current = await toApiPlanLicenseWithCustomize({
				license: currentLink,
				resolvePlan: (product) =>
					getPlanResponse({
						ctx,
						product,
						features: ctx.features,
					}),
			});
			changes.push(
				PlanUpdatePreviewLicenseChangeSchema.parse({
					...current,
					action: "remove",
					previous_attributes: null,
					plan_changes: null,
				}),
			);
			continue;
		}
		if (!currentLink && structuralChange?.action === "create") {
			changes.push(
				PlanUpdatePreviewLicenseChangeSchema.parse({
					license_plan_id: targetLink.licenseProduct.id,
					version: targetLink.licenseProduct.version,
					included: targetLink.included,
					prepaid_only: targetLink.prepaidOnly,
					...(targetLink.entry.customize
						? { customize: targetLink.entry.customize }
						: {}),
					action: "create",
					previous_attributes: null,
					plan_changes: null,
				}),
			);
			continue;
		}

		const [basePlan, targetPlan, currentPlan, current] = await Promise.all([
			getPlanResponse({
				ctx,
				product: targetLink.licenseProduct,
				features: ctx.features,
			}),
			getPlanResponse({
				ctx,
				product: targetLink.effectiveProduct,
				features: ctx.features,
			}),
			currentLink
				? getPlanResponse({
						ctx,
						product: currentLink.product,
						features: ctx.features,
					})
				: null,
			currentLink
				? toApiPlanLicenseWithCustomize({
						license: currentLink,
						resolvePlan: (product) =>
							getPlanResponse({
								ctx,
								product,
								features: ctx.features,
							}),
					})
				: null,
		]);
		const customize = diffLicensePlanCustomize({
			basePlan,
			effectivePlan: targetPlan,
		});
		const target: ApiPlanLicenseV1 = {
			license_plan_id: targetLink.licenseProduct.id,
			version: targetLink.licenseProduct.version,
			included: targetLink.included,
			prepaid_only: targetLink.prepaidOnly,
			...(customize ? { customize } : {}),
		};
		const planChanges = currentPlan
			? PlanUpdatePreviewPlanChangesSchema.parse(
					buildCorePlanUpdatePreview({
						ctx,
						planId: licensePlanId,
						current: currentPlan,
						preview: targetPlan,
						hasCustomers: false,
						customerCount: 0,
						versionable: false,
					}),
				)
			: null;
		const hasPlanChanges = Boolean(
			planChanges &&
				planUpdatePreviewHasDiff({
					...planChanges,
					license_changes: [],
				}),
		);
		if (!structuralChange && !hasPlanChanges) continue;

		changes.push(
			PlanUpdatePreviewLicenseChangeSchema.parse({
				...target,
				action: structuralChange?.action ?? "update",
				previous_attributes: current
					? diffLinkPreviousAttributes({ current, target })
					: null,
				plan_changes: hasPlanChanges ? planChanges : null,
			}),
		);
	}

	return changes;
};
