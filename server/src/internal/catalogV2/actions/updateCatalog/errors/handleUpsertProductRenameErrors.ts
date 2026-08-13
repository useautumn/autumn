import {
	ErrCode,
	productKeyToString,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/**
 * Ids a rename may not take: every id in the projected catalog and every
 * persisted id, minus this plan's own rows. Persisted ids stay taken even
 * when this batch renames them away, so execute never depends on op order.
 */
const takenPlanIdsForRename = ({
	planParams,
	params,
	productStatesContext,
	updateCatalogPlan,
}: {
	planParams: UpdateCatalogParams["plans"][number];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Set<string> => {
	const renamingInternalIds = new Set(
		(productStatesContext.versionsByPlanId[planParams.plan_id] ?? []).map(
			(product) => product.internal_id,
		),
	);
	const persistedProducts = Object.values(
		productStatesContext.versionsByPlanId,
	).flat();
	const siblingParamIds = params.plans.flatMap((entry) =>
		entry.plan_id === planParams.plan_id
			? []
			: [entry.plan_id, entry.new_plan_id].filter(
					(id): id is string => id != null,
				),
	);

	return new Set([
		...[...updateCatalogPlan.projected.products, ...persistedProducts]
			.filter((product) => !renamingInternalIds.has(product.internal_id))
			.map((product) => product.id),
		...siblingParamIds,
	]);
};

/** Block new_plan_id when occupied, or when any version has customers or reward programs. */
export const handleUpsertProductRenameErrors = ({
	params,
	productStatesContext,
	updateCatalogPlan,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	for (const planParams of params.plans) {
		if (!planParams.new_plan_id) continue;

		if (
			takenPlanIdsForRename({
				planParams,
				params,
				productStatesContext,
				updateCatalogPlan,
			}).has(planParams.new_plan_id)
		) {
			throw new RecaseError({
				message: `Cannot change product ID to ${planParams.new_plan_id}: a plan with that ID already exists (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const versions =
			productStatesContext.versionsByPlanId[planParams.plan_id] ?? [];
		const hasCustomers = versions.some((product) => {
			const state =
				productStatesContext.statesByPlanVersion[
					productKeyToString({
						productKey: { planId: product.id, version: product.version },
					})
				];
			return state?.customerUsage.hasAnyCustomerProducts ?? false;
		});

		if (hasCustomers) {
			throw new RecaseError({
				message: `Cannot change product ID because it has existing customers (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const rewardPrograms =
			productStatesContext.rewardProgramsByPlanId[planParams.plan_id] ?? [];
		if (rewardPrograms.length > 0) {
			throw new RecaseError({
				message: `Cannot change product ID because existing reward programs are linked to it (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
