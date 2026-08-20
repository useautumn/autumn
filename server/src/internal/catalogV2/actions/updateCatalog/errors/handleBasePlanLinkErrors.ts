import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const rejectBasePlanLink = (message: string): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

export const handleBasePlanLinkErrors = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const plan of params.plans) {
		if (plan.base_plan_id === undefined) continue;

		const targetVersions =
			productStatesContext.versionsByPlanId[plan.plan_id] ?? [];
		if (targetVersions.length === 0) {
			rejectBasePlanLink("base_plan_id can only be set on an existing plan.");
		}
		if (plan.base_plan_id === null) continue;
		if (plan.base_plan_id === plan.plan_id) {
			rejectBasePlanLink("A plan cannot be linked to itself as a base plan.");
		}

		const base = productStatesContext.versionsByPlanId[plan.base_plan_id]?.[0];
		if (!base || base.archived) {
			rejectBasePlanLink(`Invalid base plan: ${plan.base_plan_id}`);
		}
		if (base.base_internal_product_id !== null) {
			rejectBasePlanLink("A variant plan cannot be used as a base plan.");
		}

		const targetInternalIds = new Set(
			targetVersions.map((version) => version.internal_id),
		);
		const hasVariants = Object.values(
			productStatesContext.versionsByPlanId,
		).some((versions) =>
			versions.some(
				(version) =>
					version.id !== plan.plan_id &&
					version.base_internal_product_id != null &&
					targetInternalIds.has(version.base_internal_product_id),
			),
		);
		if (hasVariants) {
			rejectBasePlanLink(
				"A plan with variants cannot be linked to another base plan.",
			);
		}
	}
};
