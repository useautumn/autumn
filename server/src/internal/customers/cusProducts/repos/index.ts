import { batchUpdateCustomerProducts } from "./batchUpdateCustomerProducts";
import { getByExternalIds } from "./getByExternalIds";

export const customerProductRepo = {
	batchUpdate: batchUpdateCustomerProducts,
	getByExternalIds,
};
