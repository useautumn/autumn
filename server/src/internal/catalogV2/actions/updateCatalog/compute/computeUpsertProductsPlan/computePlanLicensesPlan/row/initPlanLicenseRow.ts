import type {
	PlanLicensePlan,
	PlanLicenseRowWrite,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const resolveCustomizedFlag = ({
	planLicense,
}: {
	planLicense: PlanLicensePlan;
}): boolean => {
	if (planLicense.entitlementPricesPlan) return true;
	if (planLicense.customize === null) return false;
	return planLicense.currentPlanLicense?.customized ?? false;
};

export const initPlanLicenseRow = ({
	rowId,
	planLicense,
	parentInternalProductId,
	licenseInternalProductId,
}: {
	rowId: string;
	planLicense: PlanLicensePlan;
	parentInternalProductId: string;
	licenseInternalProductId: string;
}): PlanLicenseRowWrite => ({
	id: rowId,
	parentInternalProductId,
	licenseInternalProductId,
	included: planLicense.included,
	prepaidOnly: planLicense.prepaidOnly,
	metadata: planLicense.metadata,
	customized: resolveCustomizedFlag({ planLicense }),
});
