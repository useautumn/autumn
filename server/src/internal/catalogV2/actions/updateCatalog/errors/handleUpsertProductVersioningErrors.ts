import {
	type CatalogPlanVersioningStrategy,
	ErrCode,
	type FullProduct,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { versionForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/versionForSlug";

const rejectStrategyPlusExplicitVersion = ({
	planId,
	versioning,
	version,
	versionSlug,
}: {
	planId: string;
	versioning: CatalogPlanVersioningStrategy | undefined;
	version: number | undefined;
	versionSlug?: string;
}): void => {
	if (
		(versioning === "all_versions" || versioning === "new_version") &&
		(version !== undefined || versionSlug !== undefined)
	) {
		throw new RecaseError({
			message: `versioning "${versioning}" cannot be combined with an explicit version (plan_id=${planId}). Omit version to target latest.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

const claimPinnedVersion = ({
	planId,
	version,
	seenPinned,
}: {
	planId: string;
	version: number;
	seenPinned: Set<string>;
}): void => {
	const pinKey = `${planId}@${version}`;
	if (seenPinned.has(pinKey)) {
		throw new RecaseError({
			message: `Duplicate plan entry for plan_id=${planId} version=${version}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	seenPinned.add(pinKey);
};

const rejectNewVersionOnNonActiveRow = ({
	planId,
	row,
}: {
	planId: string;
	row: FullProduct | null;
}): void => {
	if (!row || row.active) return;
	throw new RecaseError({
		message: `versioning "new_version" can only target the active row (plan_id=${planId})`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
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
		if (planParams.versioning === "new_version") {
			if (
				planParams.version !== undefined ||
				planParams.version_slug !== undefined
			) {
				rejectNewVersionOnNonActiveRow({
					planId: planParams.plan_id,
					row: fullProductForPlanParams({
						planParams,
						productStatesContext,
					}),
				});
			}
			for (const variant of planParams.variants ?? []) {
				if (
					variant.version === undefined &&
					variant.version_slug === undefined
				) {
					continue;
				}
				rejectNewVersionOnNonActiveRow({
					planId: variant.variant_plan_id,
					row: fullProductForPlanParams({
						planParams: {
							plan_id: variant.variant_plan_id,
							version: variant.version,
							version_slug: variant.version_slug,
						},
						productStatesContext,
					}),
				});
			}
		}

		rejectStrategyPlusExplicitVersion({
			planId: planParams.plan_id,
			versioning: planParams.versioning,
			version: planParams.version,
			versionSlug: planParams.version_slug,
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

		for (const target of [
			...(planParams.propagate?.license_parents ?? []),
			...(planParams.propagate?.variants ?? []),
		]) {
			if (target.version_slug !== undefined && target.version === undefined) {
				const version = versionForSlug({
					planId: target.plan_id,
					versionSlug: target.version_slug,
					productStatesContext,
				});
				if (version === undefined) {
					throw new RecaseError({
						message: `Unknown version_slug "${target.version_slug}" for plan_id=${target.plan_id}`,
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}
			}
		}

		if (planParams.version !== undefined) {
			claimPinnedVersion({
				planId: planParams.plan_id,
				version: planParams.version,
				seenPinned,
			});

			const maxVersion = maxVersionForPlan({
				planId: planParams.plan_id,
				productStatesContext,
			});
			if (planParams.version > maxVersion + 1) {
				throw new RecaseError({
					message: `Version gap: plan_id=${planParams.plan_id} version=${planParams.version} exceeds max existing version ${maxVersion} + 1`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		} else if (planParams.version_slug !== undefined) {
			const version = versionForSlug({
				planId: planParams.plan_id,
				versionSlug: planParams.version_slug,
				productStatesContext,
			});
			if (version === undefined) {
				throw new RecaseError({
					message: `Unknown version_slug "${planParams.version_slug}" for plan_id=${planParams.plan_id}`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			claimPinnedVersion({
				planId: planParams.plan_id,
				version,
				seenPinned,
			});
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
