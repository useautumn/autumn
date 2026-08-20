import {
	type FullPlanLicense,
	type FullProduct,
	planLicenseToCustomizedBasePrice,
} from "@autumn/shared";

/** Overlay custom base fee only — plan-license customize cannot add paid usage features. */
export const planLicenseToCustomStripeInitProduct = ({
	planLicense,
}: {
	planLicense: FullPlanLicense;
}): FullProduct | null => {
	const customizedBasePrice = planLicenseToCustomizedBasePrice({ planLicense });

	if (!customizedBasePrice) return null;

	return {
		...planLicense.product,
		prices: [customizedBasePrice],
	};
};

export const planLicenseToStripeInitProduct = ({
	planLicense,
}: {
	planLicense: FullPlanLicense;
}): FullProduct =>
	planLicenseToCustomStripeInitProduct({ planLicense }) ?? planLicense.product;
