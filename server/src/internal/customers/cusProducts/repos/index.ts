import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";
import { getByCustomerAndProduct } from "./getByCustomerAndProduct";
import { getByExternalIds } from "./getByExternalIds";
import { getByStripeSubId } from "./getByStripeSubId";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByCustomerAndProduct,
	getByExternalIds,
	getByStripeSubId,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
