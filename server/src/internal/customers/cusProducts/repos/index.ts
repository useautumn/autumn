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

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByCustomerAndProduct,
	getByExternalIds,
	getByInternalProductId,
	getByStripeSubId,
	getVersioningUsage,
	getVersioningUsageForProduct,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
