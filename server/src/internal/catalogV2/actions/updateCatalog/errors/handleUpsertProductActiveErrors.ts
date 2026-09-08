import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";

/** Promote is take-the-pointer only. `active: false` needs a same-call successor. */
export const handleUpsertProductActiveErrors = ({
	params,
}: {
	params: UpdateCatalogParams;
}): void => {
	const planIdsTakingPointer = new Set<string>();

	for (const planParams of params.plans ?? []) {
		const allVersionsActive =
			planParams.versioning === "all_versions" && planParams.active === true;
		if (allVersionsActive) {
			throw new RecaseError({
				message: "Cannot set active on all_versions",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (planParams.active !== true) continue;
		const alreadyTakingPointer = planIdsTakingPointer.has(planParams.plan_id);
		if (alreadyTakingPointer) {
			throw new RecaseError({
				message: "Cannot set active on two versions of the same plan",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		planIdsTakingPointer.add(planParams.plan_id);
	}

	for (const planParams of params.plans ?? []) {
		if (planParams.active !== false) continue;
		if (planIdsTakingPointer.has(planParams.plan_id)) continue;

		throw new RecaseError({
			message: `Cannot set active to false on plan "${planParams.plan_id}": no version of it is active in this update. At least one version of each plan must be active. planVersions is for historical inactive products, and plans is for the active version.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
