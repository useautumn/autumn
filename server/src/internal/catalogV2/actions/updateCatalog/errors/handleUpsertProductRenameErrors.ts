import {
	ErrCode,
	productKeyToString,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Block new_plan_id when any version has customers or reward programs. */
export const handleUpsertProductRenameErrors = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const planParams of params.plans) {
		if (!planParams.new_plan_id) continue;

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
