import {
	type FullPlanLicense,
	type FullProduct,
	planLicenseToCustomizedBasePrice,
} from "@autumn/shared";

export const planLicenseToParentStripeInitProduct = ({
	planLicense,
	parentProduct,
}: {
	planLicense: FullPlanLicense;
	parentProduct: FullProduct;
}): FullProduct | null => {
	const customizedBasePrice = planLicenseToCustomizedBasePrice({ planLicense });

	if (!customizedBasePrice || !parentProduct.processor?.id) {
		return null;
	}

	return {
		...planLicense.product,
		processor: parentProduct.processor,
		prices: [customizedBasePrice],
	};
};

export const planLicenseToStripeInitProduct = ({
	planLicense,
	parentProduct,
}: {
	planLicense: FullPlanLicense;
	parentProduct: FullProduct;
}): FullProduct =>
	planLicenseToParentStripeInitProduct({ planLicense, parentProduct }) ??
	planLicense.product;
