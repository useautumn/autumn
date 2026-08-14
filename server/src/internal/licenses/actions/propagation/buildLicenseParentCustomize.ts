import type { ApiPlanV1, LicenseCustomize } from "@autumn/shared";
import { applyLicenseCustomizeToBasePlan } from "@/internal/licenses/actions/customize/rebaseCatalogPlanLicenses.js";
import { diffLicensePlanCustomize } from "@/internal/licenses/actions/customize/toApiPlanLicenseWithCustomize.js";
import { getApiPlanDiff } from "@/internal/product/actions/common/planTransformUtils.js";

/** A customized link keeps its own overrides rebased onto the edited child; an
 * uncustomized one simply follows the child. */
export const buildLicenseParentTargetCustomize = ({
	currentChildPlan,
	editedChildPlan,
	currentEffectivePlan,
	customized,
}: {
	currentChildPlan: ApiPlanV1;
	editedChildPlan: ApiPlanV1;
	currentEffectivePlan: ApiPlanV1;
	customized: boolean;
}): {
	targetEffectivePlan: ApiPlanV1;
	targetCustomize: LicenseCustomize | undefined;
	migrationCustomize: LicenseCustomize | undefined;
} => {
	const targetEffectivePlan = customized
		? applyLicenseCustomizeToBasePlan({
				basePlan: editedChildPlan,
				customize: getApiPlanDiff({
					from: currentChildPlan,
					to: currentEffectivePlan,
				}),
			})
		: editedChildPlan;

	return {
		targetEffectivePlan,
		targetCustomize: diffLicensePlanCustomize({
			basePlan: editedChildPlan,
			effectivePlan: targetEffectivePlan,
		}),
		// A migration moves customers holding the OLD definition, so its delta is
		// measured from what they have now — not from the edited catalog plan,
		// against which an uncustomized link diffs to nothing.
		migrationCustomize: diffLicensePlanCustomize({
			basePlan: currentEffectivePlan,
			effectivePlan: targetEffectivePlan,
		}),
	};
};
