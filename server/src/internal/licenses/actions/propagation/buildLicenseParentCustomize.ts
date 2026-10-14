import {
	type ApiPlanV1,
	applyLicenseCustomizeToBasePlan,
	diffLicensePlanCustomize,
	type LicenseCustomize,
} from "@autumn/shared";
import { getApiPlanDiff } from "@/internal/product/actions/common/planTransformUtils.js";

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
		migrationCustomize: diffLicensePlanCustomize({
			basePlan: currentEffectivePlan,
			effectivePlan: targetEffectivePlan,
		}),
	};
};
