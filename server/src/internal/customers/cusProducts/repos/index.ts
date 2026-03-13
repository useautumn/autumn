import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";
import { getByExternalIds } from "./getByExternalIds";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByExternalIds,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
