import { productToEmptyFeatureQuantities } from "@utils/productUtils/convertProduct/productToEmptyFeatureQuantities";

export * from "./planLicenseUtils/index.js";

export const productUtils = {
	convert: {
		toEmptyFeatureQuantities: productToEmptyFeatureQuantities,
	},
};
