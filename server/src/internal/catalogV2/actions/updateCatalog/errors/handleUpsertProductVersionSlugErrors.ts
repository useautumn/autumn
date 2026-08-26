import { ErrCode, RecaseError } from "@autumn/shared";
import { detectVersionSlugCollisions } from "@/internal/catalogV2/actions/updateCatalog/errors/detectVersionSlugCollisions";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Block projected version_slug clashes on the same plan id (swap-safe: final set). */
export const handleUpsertProductVersionSlugErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const [collision] = detectVersionSlugCollisions({
		products: updateCatalogPlan.projected.products,
	});
	if (!collision) return;

	throw new RecaseError({
		message: `Cannot set version_slug to ${collision.versionSlug}: another version of plan_id=${collision.planId} already has that slug`,
		code: ErrCode.DuplicateVersionSlug,
		statusCode: 400,
	});
};
