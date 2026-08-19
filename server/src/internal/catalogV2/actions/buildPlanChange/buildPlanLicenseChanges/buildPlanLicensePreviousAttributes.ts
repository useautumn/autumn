import type {
	FullPlanLicense,
	PlanLicensePreviousAttributesV0,
} from "@autumn/shared";

export const buildPlanLicensePreviousAttributes = ({
	from,
	to,
}: {
	from: FullPlanLicense;
	to: FullPlanLicense;
}): PlanLicensePreviousAttributesV0 | null => {
	const previous: PlanLicensePreviousAttributesV0 = {};
	if (from.included !== to.included) previous.included = from.included;
	if (from.prepaid_only !== to.prepaid_only) {
		previous.prepaid_only = from.prepaid_only;
	}
	if (from.product.version !== to.product.version) {
		previous.version = from.product.version;
	}
	return Object.keys(previous).length > 0 ? previous : null;
};
