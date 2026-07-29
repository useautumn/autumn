import type { FullPlanLicense } from "@models/licenseModels/fullPlanLicenseModel.js";
import { productToBasePrice } from "@utils/productUtils/convertProductUtils.js";

export const planLicenseToCustomizedBasePrice = ({
	planLicense,
}: {
	planLicense: FullPlanLicense;
}) => {
	if (!planLicense.customized) return null;
	const basePrice = productToBasePrice({ product: planLicense.product });
	return basePrice?.is_custom ? basePrice : null;
};
