import { countResetEligibleCustomerEntitlements } from "./countResetEligibleCustomerEntitlements.js";
import { getResetContextByIds } from "./getResetContextByIds.js";
import { getResetEligibleCustomerEntitlementsPage } from "./getResetEligibleCustomerEntitlementsPage.js";

export const customerEntitlementsRepo = {
	countResetEligibleCustomerEntitlements,
	getResetContextByIds,
	getResetEligibleCustomerEntitlementsPage,
};
