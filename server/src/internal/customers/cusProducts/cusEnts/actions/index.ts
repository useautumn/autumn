import { adjustBalanceDbAndCache } from "./adjustBalanceDbAndCache";
import { updateCusEntDbAndCache } from "./updateCusEntDbAndCache";

export const customerEntitlementActions = {
	/** Adjusts a cusEnt balance in both Postgres and the Redis FullCustomer cache */
	adjustBalanceDbAndCache,
	/** Updates a cusEnt in both Postgres and the Redis FullCustomer cache */
	updateDbAndCache: updateCusEntDbAndCache,
};
