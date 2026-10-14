import {
	type CatalogPlanVersioningStrategy,
	type CatalogPropagateTargetParams,
	type CatalogVariantParams,
	ErrCode,
	type FullProduct,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { mintedVariantPins } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/mintedVariantPins";
import { variantPinKey } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantEntryMintsRow";
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

const rejectUnknownVariantVersion = ({
	variant,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	productStatesContext: ProductStatesContext;
}): void => {
	if (variant.version === undefined) return;
	if (
		fullProductForPlanParams({
			planParams: {
				plan_id: variant.variant_plan_id,
				version: variant.version,
			},
			productStatesContext,
		}) !== null
	) {
		return;
	}

	const nextVersion =
		maxVersionForPlan({
			planId: variant.variant_plan_id,
			productStatesContext,
		}) + 1;
	throw new RecaseError({
		message: `Unknown version ${variant.version} for plan_id=${variant.variant_plan_id}. The next version is ${nextVersion}; name it with version_slug to mint it.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const rejectUnknownTargetSlug = ({
	target,
	mintedPins,
	productStatesContext,
}: {
	target: CatalogPropagateTargetParams;
	mintedPins?: Set<string>;
	productStatesContext: ProductStatesContext;
}): void => {
	if (target.version_slug === undefined || target.version !== undefined) return;
	if (
		versionForSlug({
			planId: target.plan_id,
			versionSlug: target.version_slug,
			productStatesContext,
		}) !== undefined
	) {
		return;
	}
	if (
		mintedPins?.has(
			variantPinKey({
				planId: target.plan_id,
				versionSlug: target.version_slug,
			}),
		)
	) {
		return;
	}

	throw new RecaseError({
		message: `Unknown version_slug "${target.version_slug}" for plan_id=${target.plan_id}`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

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
	const mintedPins = new Set(
		(params.plans ?? []).flatMap((planParams) => {
			const base = fullProductForPlanParams({
				planParams,
				productStatesContext,
			});
			return [
				...mintedVariantPins({
					variants: planParams.variants ?? [],
					anchorInternalIds: new Set(base ? [base.internal_id] : []),
					baseVersionSlug:
						planParams.new_version_slug ??
						planParams.version_slug ??
						base?.version_slug ??
						undefined,
					productStatesContext,
				}),
			];
		}),
	);

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

		for (const variant of planParams.variants ?? []) {
			rejectUnknownVariantVersion({ variant, productStatesContext });
		}

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

		for (const target of planParams.propagate?.license_parents ?? []) {
			rejectUnknownTargetSlug({ target, productStatesContext });
		}
		for (const target of planParams.propagate?.variants ?? []) {
			rejectUnknownTargetSlug({ target, mintedPins, productStatesContext });
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
				mintedVersionsByPlanId.get(planParams.plan_id) ?? 0,
			);
			if (planParams.version > maxVersion + 1) {
				throw new RecaseError({
					message: `Version gap: plan_id=${planParams.plan_id} version=${planParams.version} exceeds max existing version ${maxVersion} + 1`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
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
