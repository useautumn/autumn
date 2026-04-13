import { notNullish, type ResetCusEnt } from "@autumn/shared";
import { batchDeleteCachedFullCustomers } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/batchDeleteCachedFullCustomers";

export const clearCusEntsFromCache = async ({
	cusEnts,
}: {
	cusEnts: ResetCusEnt[];
}) => {
	const customersToDelete = cusEnts
		.filter((ce) => notNullish(ce.customer.id))
		.map((cusEnt) => ({
			orgId: cusEnt.customer.org_id,
			env: cusEnt.customer.env,
			customerId: cusEnt.customer.id!,
		}));

	if (customersToDelete.length === 0) return;

	await batchDeleteCachedFullCustomers({ customers: customersToDelete });
};
