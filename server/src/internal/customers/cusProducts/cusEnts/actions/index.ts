import { adjustBalanceDbAndCache } from "./adjustBalanceDbAndCache";
import { updateCusEntDbAndCache } from "./updateCusEntDbAndCache";

export const customerEntitlementActions = {
	adjustBalanceDbAndCache,
	updateDbAndCache: updateCusEntDbAndCache,
};
