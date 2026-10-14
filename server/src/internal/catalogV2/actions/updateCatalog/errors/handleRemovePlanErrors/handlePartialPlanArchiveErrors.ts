import { ErrCode, RecaseError } from "@autumn/shared";
import type {
	RemovePlanPlan,
	UpdateCatalogPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

const partialArchiveMessage = ({
	removePlan,
}: {
	removePlan: RemovePlanPlan;
}): string => {
	const { planId, version, hasCustomers } = removePlan;
	const blocker = hasCustomers
		? "still has customers"
		: "is linked to a reward";
	const clearIt = hasCustomers ? "expire or migrate them" : "unlink the reward";
	return `${planId} v${version} ${blocker}. Either ${clearIt} and delete the version, or archive all versions of ${planId} to retire the plan.`;
};

export const handlePartialPlanArchiveErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	for (const removePlan of updateCatalogPlan.removePlans) {
		if (removePlan.allVersions || !removePlan.willArchive) continue;

		throw new RecaseError({
			message: partialArchiveMessage({ removePlan }),
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
