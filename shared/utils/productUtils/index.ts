import { productToEmptyFeatureQuantities } from "@utils/productUtils/convertProduct/productToEmptyFeatureQuantities";

export * from "./entitlementPriceUtils/index.js";
export * from "./planLicenseUtils/index.js";

export const productUtils = {
	convert: {
		toEmptyFeatureQuantities: productToEmptyFeatureQuantities,
	},
};
