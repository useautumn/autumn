import { deleteByInternalCustomerId } from "./deleteByInternalCustomerId.js";
import { insertMany } from "./insertMany.js";
import { listByInternalCustomerIdForFeatures } from "./listByInternalCustomerIdForFeatures.js";
import { updateBalance } from "./updateBalance.js";

export const customerEntitlementStore = {
	deleteByInternalCustomerId,
	insertMany,
	listByInternalCustomerIdForFeatures,
	updateBalance,
};
