import {
	type CatalogPlanVersioningStrategy,
	ErrCode,
	type FullProduct,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
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

/** Two entries naming the same new slug is the same ambiguity as a double pin. */
const claimMintedSlug = ({
	planId,
	versionSlug,
	seenSlugs,
}: {
	planId: string;
	versionSlug: string;
	seenSlugs: Set<string>;
}): void => {
	const slugKey = `${planId}@${versionSlug}`;
	if (seenSlugs.has(slugKey)) {
		throw new RecaseError({
			message: `Duplicate plan entry for plan_id=${planId} version_slug=${versionSlug}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	seenSlugs.add(slugKey);
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
	const seenSlugs = new Set<string>();
	const unpinnedPlanIds = new Set<string>();
	const mintedVersionsByPlanId = new Map<string, number>();

	for (const planParams of params.plans ?? []) {
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

			const maxVersion = Math.max(
				maxVersionForPlan({
					planId: planParams.plan_id,
					productStatesContext,
				}),
				// Rows minted earlier in this same request count: a full-history
				// push states v1, v2, v3 against a catalog that holds none of them.
				mintedVersionsByPlanId.get(planParams.plan_id) ?? 0,
			);
			if (planParams.version > maxVersion + 1) {
				throw new RecaseError({
					message: `Version gap: plan_id=${planParams.plan_id} version=${planParams.version} exceeds max existing version ${maxVersion} + 1`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			// Recorded only AFTER the check: an entry must not authorise its own
			// gap, it only widens the ceiling for rows stated after it.
			mintedVersionsByPlanId.set(
				planParams.plan_id,
				Math.max(
					mintedVersionsByPlanId.get(planParams.plan_id) ?? 0,
					planParams.version,
				),
			);
		} else if (
			planParams.internal_id !== undefined &&
			findFullProductByInternalId({
				internalId: planParams.internal_id,
				productStatesContext,
			}) !== null
		) {
			// A stable id pins the entry to its own row; no slug is needed and it
			// never competes with an unpinned sibling.
			const current = findFullProductByInternalId({
				internalId: planParams.internal_id,
				productStatesContext,
			});
			if (current !== null && current.id === planParams.plan_id) {
				claimPinnedVersion({
					planId: planParams.plan_id,
					version: current.version,
					seenPinned,
				});
			}
		} else if (planParams.version_slug !== undefined) {
			const version = versionForSlug({
				planId: planParams.plan_id,
				versionSlug: planParams.version_slug,
				productStatesContext,
			});
			// A slug naming no row mints one — the config states history the
			// catalog does not have yet. Two entries claiming the same slug are
			// still ambiguous, whether or not the row exists.
			if (version === undefined) {
				claimMintedSlug({
					planId: planParams.plan_id,
					versionSlug: planParams.version_slug,
					seenSlugs,
				});
			} else {
				claimPinnedVersion({
					planId: planParams.plan_id,
					version,
					seenPinned,
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

			// On a plan that does not exist yet an unpinned entry mints v1, so it
			// collides with another entry pinning v1. Claiming the version it will
			// take surfaces that as the duplicate it is.
			if (existingVersions.length === 0) {
				claimPinnedVersion({
					planId: planParams.plan_id,
					version: (mintedVersionsByPlanId.get(planParams.plan_id) ?? 0) + 1,
					seenPinned,
				});
			}
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
