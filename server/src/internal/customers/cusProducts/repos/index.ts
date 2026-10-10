import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";
import { flipCustomerProductsIsCustom } from "./flipCustomerProductsIsCustom";
import { getByCustomerAndProduct } from "./getByCustomerAndProduct";
import { getByExternalIds } from "./getByExternalIds";
import { getByInternalProductId } from "./getByInternalProductId";
import { getByStripeSubId } from "./getByStripeSubId";
import {
	getVersioningUsage,
	getVersioningUsageForProduct,
} from "./getVersioningUsage";
import { listFullCustomerProductsByIds } from "./listFullCustomerProductsByIds";
import { listIsCustomFingerprints } from "./listIsCustomFingerprints";
import { mergeCustomerProductProcessor } from "./mergeCustomerProductProcessor";
import { setCustomerProductIsCustom } from "./setCustomerProductIsCustom";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	flipIsCustom: flipCustomerProductsIsCustom,
	getByCustomerAndProduct,
	getByExternalIds,
	getByInternalProductId,
	getByStripeSubId,
	getVersioningUsage,
	getVersioningUsageForProduct,
	listFullByIds: listFullCustomerProductsByIds,
	listIsCustomFingerprints,
	mergeProcessor: mergeCustomerProductProcessor,
	setIsCustom: setCustomerProductIsCustom,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
