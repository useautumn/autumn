import type {
	CustomerEntitlement,
	EntitlementWithFeature,
	InitCustomerEntitlementContext,
	InitFullCustomerProductOptions,
} from "@autumn/shared";
import { generateId } from "@server/utils/genUtils";
import { initCustomerEntitlementFields } from "./initCustomerEntitlementFields";

// MAIN FUNCTION
export const initCustomerEntitlement = ({
	initContext,
	initOptions,
	entitlement,
	cusProductId,
}: {
	initContext: InitCustomerEntitlementContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
	cusProductId: string | null;
}): CustomerEntitlement => {
	return {
		id: generateId("cus_ent"),
		customer_product_id: cusProductId,
		...initCustomerEntitlementFields({
			initContext,
			initOptions,
			entitlement,
		}),
	};
};
