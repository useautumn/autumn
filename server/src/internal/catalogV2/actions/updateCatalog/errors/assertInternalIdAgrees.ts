import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { versionForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/versionForSlug";

/**
 * A stated `internal_id` and a stated version pin must name the same row.
 * Silently preferring one would apply the write somewhere the caller did not
 * ask for — and a config file that disagrees with itself is a bug worth
 * surfacing, not resolving.
 */
export const assertInternalIdAgrees = ({
	params,
	productStatesContext,
	internalIdRefs,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): void => {
	for (const planParams of params.plans) {
		const { internal_id: internalId } = planParams;
		if (!internalId) continue;

		const ref = internalIdRefs.get(internalId);
		if (!ref) continue;

		if (
			planParams.version !== undefined &&
			planParams.version !== ref.version
		) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `internal_id ${internalId} is ${ref.planId} v${ref.version}, but version ${planParams.version} was also given`,
				statusCode: 400,
			});
		}

		if (planParams.version_slug === undefined) continue;
		const slugVersion = versionForSlug({
			planId: ref.planId,
			versionSlug: planParams.version_slug,
			productStatesContext,
		});
		if (slugVersion !== undefined && slugVersion !== ref.version) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `internal_id ${internalId} is ${ref.planId} v${ref.version}, but version_slug "${planParams.version_slug}" names v${slugVersion}`,
				statusCode: 400,
			});
		}
	}
};
