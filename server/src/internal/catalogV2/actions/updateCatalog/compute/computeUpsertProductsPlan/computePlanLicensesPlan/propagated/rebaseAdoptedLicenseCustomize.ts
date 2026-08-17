import {
	applyLicenseCustomizeToBasePlan,
	diffPlanV1,
	type FullProduct,
	type LicenseCustomize,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { toMigratableCustomize } from "@/internal/catalogV2/actions/buildMigrationDraft/toMigratableCustomize";
import {
	diffFullProducts,
	fullProductToApiPlanV1Sync,
} from "@/internal/catalogV2/actions/buildPlanChange";
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
		customize: diffFullProducts({
			from: oldChildProduct,
			to: effectiveProduct,
			features,
		}),
	});
	const newChildPlan = fullProductToApiPlanV1Sync({
		product: newChildProduct,
		features,
	});
	const rebased = toMigratableCustomize({
		customize: diffPlanV1({
			from: newChildPlan,
			to: applyLicenseCustomizeToBasePlan({
				basePlan: newChildPlan,
				customize: storedCustomize,
			}),
		}),
	});

	return hasCustomizeFields(rebased) ? rebased : null;
};
