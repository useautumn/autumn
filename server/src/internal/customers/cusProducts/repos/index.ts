import { applyIsCustomByFingerprint } from "./applyIsCustomByFingerprint";
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
import { listFullCustomerProductsByIds } from "./listFullCustomerProductsByIds";
import { mergeCustomerProductProcessor } from "./mergeCustomerProductProcessor";
import { setCustomerProductIsCustom } from "./setCustomerProductIsCustom";

export const customerProductRepo = {
	applyIsCustomByFingerprint,
	batchUpdate: batchUpdateCustomerProducts,
	getByCustomerAndProduct,
	getByExternalIds,
	getByInternalProductId,
	getByStripeSubId,
	getVersioningUsage,
	getVersioningUsageForProduct,
	listFullByIds: listFullCustomerProductsByIds,
	mergeProcessor: mergeCustomerProductProcessor,
	setIsCustom: setCustomerProductIsCustom,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
