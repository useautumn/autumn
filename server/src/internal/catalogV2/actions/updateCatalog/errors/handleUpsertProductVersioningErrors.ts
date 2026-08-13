import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Reject unsupported versioning and invalid batch planParams shape. */
export const handleUpsertProductVersioningErrors = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): void => {
	const seenPinned = new Set<string>();
	const unpinnedPlanIds = new Set<string>();
	const creatingPlanIds = new Set<string>();

	for (const planParams of params.plans) {
		if (
			(planParams.versioning === "all_versions" ||
				planParams.versioning === "new_version") &&
			planParams.version !== undefined
		) {
			throw new RecaseError({
				message: `versioning "${planParams.versioning}" cannot be combined with an explicit version (plan_id=${planParams.plan_id}). Omit version to target latest.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const existingVersions =
			productStatesContext.versionsByPlanId[planParams.plan_id] ?? [];

		if (existingVersions.length === 0) {
			if (creatingPlanIds.has(planParams.plan_id)) {
				throw new RecaseError({
					message: `Cannot create plan_id=${planParams.plan_id} with multiple entries`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			creatingPlanIds.add(planParams.plan_id);
		}

		if (
			planParams.versioning === "new_version" &&
			planParams.migration?.draft
		) {
			throw new RecaseError({
				message: `versioning "new_version" cannot be combined with migration.draft (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (
			planParams.versioning === "new_version" &&
			existingVersions.length === 0
		) {
			throw new RecaseError({
				message: `versioning "new_version" requires an existing plan (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (planParams.version !== undefined) {
			const pinKey = `${planParams.plan_id}@${planParams.version}`;
			if (seenPinned.has(pinKey)) {
				throw new RecaseError({
					message: `Duplicate plan entry for plan_id=${planParams.plan_id} version=${planParams.version}`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			seenPinned.add(pinKey);

			const maxVersion = existingVersions[0]?.version ?? 0;
			if (planParams.version > maxVersion + 1) {
				throw new RecaseError({
					message: `Version gap: plan_id=${planParams.plan_id} version=${planParams.version} exceeds max existing version ${maxVersion} + 1`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		} else {
			if (unpinnedPlanIds.has(planParams.plan_id)) {
				throw new RecaseError({
					message: `Duplicate unpinned plan entry for plan_id=${planParams.plan_id}`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			unpinnedPlanIds.add(planParams.plan_id);
		}

		if (existingVersions.length === 0 && planParams.name === undefined) {
			throw new RecaseError({
				message: `name is required when creating plan_id=${planParams.plan_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
