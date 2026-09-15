import { ErrCode, RecaseError } from "@autumn/shared";
import type {
	RemovePlanPlan,
	UpdateCatalogPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Names the blocker and the two ways out: retire this version, or the whole plan. */
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

/** Archival is plan-wide; version omission may only hard-delete or tombstone. */
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
