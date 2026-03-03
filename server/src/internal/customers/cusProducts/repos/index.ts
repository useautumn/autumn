import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { getByExternalIds } from "./getByExternalIds";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByExternalIds,
	batchUpdate: batchUpdateCustomerProducts,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
