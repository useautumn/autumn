import { findNewestReusableFixedPrice } from "./findNewestReusableFixedPrice.js";
import { listDistinctBasePricesByCustomerLicense } from "./listDistinctBasePricesByCustomerLicense.js";

export const priceRepo = {
	findNewestReusableFixedPrice,
	listDistinctBasePricesByCustomerLicense,
} as const;
