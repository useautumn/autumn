import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { fetchCustomerProductFreeTrials } from "./fetchCustomerProductFreeTrials";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	fetchFreeTrials: fetchCustomerProductFreeTrials,
};
