import type { FullProduct, LicenseCustomize } from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";
import { toMigratableCustomize } from "@/internal/catalogV2/actions/buildMigrationDraft/toMigratableCustomize";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyLicenseCustomizeToBasePlan } from "@/internal/licenses/actions/customize/rebaseCatalogPlanLicenses";
import { getApiPlanDiff } from "@/internal/product/actions/common/planTransformUtils";
import { hasCustomizeFields } from "../licensePlanUtils";

/**
 * Express the current overlay as a customize off the new child. Empty
 * means the child now matches — collapse to stock.
 */
export const rebaseAdoptedLicenseCustomize = ({
	ctx,
	oldChildProduct,
	effectiveProduct,
	newChildProduct,
}: {
	ctx: AutumnContext;
	oldChildProduct: FullProduct;
	effectiveProduct: FullProduct;
	newChildProduct: FullProduct;
}): LicenseCustomize | null => {
	const features = ctx.features;
	const storedCustomize = toMigratableCustomize({
		customize: getApiPlanDiff({
			from: fullProductToApiPlanV1Sync({
				product: oldChildProduct,
				features,
			}),
			to: fullProductToApiPlanV1Sync({
				product: effectiveProduct,
				features,
			}),
		}),
	});
	const newChildPlan = fullProductToApiPlanV1Sync({
		product: newChildProduct,
		features,
	});
	const rebased = toMigratableCustomize({
		customize: getApiPlanDiff({
			from: newChildPlan,
			to: applyLicenseCustomizeToBasePlan({
				basePlan: newChildPlan,
				customize: storedCustomize,
			}),
		}),
	});

	return hasCustomizeFields(rebased) ? rebased : null;
};
