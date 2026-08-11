import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";

/** Reject unsupported / ambiguous planParams.versioning before execute. */
export const handleUpsertProductVersioningErrors = ({
	params,
}: {
	params: UpdateCatalogParams;
}): void => {
	for (const planParams of params.plans) {
		if (planParams.versioning === "new_version") {
			throw new RecaseError({
				message: `versioning "new_version" is not implemented yet (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (
			planParams.versioning === "all_versions" &&
			planParams.version !== undefined
		) {
			throw new RecaseError({
				message: `versioning "all_versions" cannot be combined with an explicit version (plan_id=${planParams.plan_id}). Declare per-version rows instead, or omit version to target latest and propagate to siblings.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
