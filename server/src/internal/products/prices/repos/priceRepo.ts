import { findNewestReusableFixedPrice } from "./findNewestReusableFixedPrice.js";
import { findNewestReusablePrepaidPrice } from "./findNewestReusablePrepaidPrice.js";
import { findNewestReusableUsagePrice } from "./findNewestReusableUsagePrice.js";
import { listDistinctBasePricesByCustomerLicense } from "./listDistinctBasePricesByCustomerLicense.js";

export const priceRepo = {
	findNewestReusableFixedPrice,
	findNewestReusablePrepaidPrice,
	findNewestReusableUsagePrice,
	listDistinctBasePricesByCustomerLicense,
} as const;
