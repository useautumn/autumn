import { adjustBalanceDbAndCache } from "./adjustBalanceDbAndCache";

export const customerEntitlementActions = {
	/** Adjusts a cusEnt balance in both Postgres and the Redis FullCustomer cache */
	adjustBalanceDbAndCache: adjustBalanceDbAndCache,
};
