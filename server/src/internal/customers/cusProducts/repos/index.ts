import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";
import { getByCustomerAndProduct } from "./getByCustomerAndProduct";
import { getByExternalIds } from "./getByExternalIds";
import { getByInternalProductId } from "./getByInternalProductId";
import { getByStripeSubId } from "./getByStripeSubId";
import {
	getVersioningUsage,
	getVersioningUsageForProduct,
} from "./getVersioningUsage";
import { mergeCustomerProductProcessor } from "./mergeCustomerProductProcessor";
import { setCustomerProductIsCustom } from "./setCustomerProductIsCustom";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByCustomerAndProduct,
	getByExternalIds,
	getByInternalProductId,
	getByStripeSubId,
	getVersioningUsage,
	getVersioningUsageForProduct,
	mergeProcessor: mergeCustomerProductProcessor,
	setIsCustom: setCustomerProductIsCustom,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
