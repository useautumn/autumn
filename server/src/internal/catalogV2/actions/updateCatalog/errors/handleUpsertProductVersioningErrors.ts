import {
	type CatalogPlanVersioningStrategy,
	ErrCode,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const rejectStrategyPlusExplicitVersion = ({
	planId,
	versioning,
	version,
}: {
	planId: string;
	versioning: CatalogPlanVersioningStrategy | undefined;
	version: number | undefined;
}): void => {
	if (
		(versioning === "all_versions" || versioning === "new_version") &&
		version !== undefined
	) {
		throw new RecaseError({
			message: `versioning "${versioning}" cannot be combined with an explicit version (plan_id=${planId}). Omit version to target latest.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

const rejectNewVersionOnMissingPlan = ({
	planId,
	versioning,
	existingVersionCount,
}: {
	planId: string;
	versioning: CatalogPlanVersioningStrategy | undefined;
	existingVersionCount: number;
}): void => {
	if (versioning === "new_version" && existingVersionCount === 0) {
		throw new RecaseError({
			message: `versioning "new_version" requires an existing plan (plan_id=${planId})`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

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
		rejectStrategyPlusExplicitVersion({
			planId: planParams.plan_id,
			versioning: planParams.versioning,
			version: planParams.version,
		});

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

		rejectNewVersionOnMissingPlan({
			planId: planParams.plan_id,
			versioning: planParams.versioning,
			existingVersionCount: existingVersions.length,
		});

		for (const target of planParams.propagate?.license_parents ?? []) {
			rejectStrategyPlusExplicitVersion({
				planId: target.plan_id,
				versioning: target.versioning,
				version: target.version,
			});
			rejectNewVersionOnMissingPlan({
				planId: target.plan_id,
				versioning: target.versioning,
				existingVersionCount: (
					productStatesContext.versionsByPlanId[target.plan_id] ?? []
				).length,
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
