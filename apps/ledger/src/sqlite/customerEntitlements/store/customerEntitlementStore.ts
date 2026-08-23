import { insertMany } from "./insertMany.js";
import { listByInternalCustomerIdForFeatures } from "./listByInternalCustomerIdForFeatures.js";
import { updateBalance } from "./updateBalance.js";

export const customerEntitlementStore = {
	insertMany,
	listByInternalCustomerIdForFeatures,
	updateBalance,
};
