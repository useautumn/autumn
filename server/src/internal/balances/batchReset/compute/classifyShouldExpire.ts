import { CusProductStatus } from "@autumn/shared";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type { ResetVerdict } from "../types.js";

/**
 * Marks a customer entitlement for expiry denormalization when its owning
 * customer product is expired but the denormalized flag is not yet true.
 */
export const classifyShouldExpire = ({
	customerEntitlement,
}: {
	customerEntitlement: ResetContextCustomerEntitlement;
}): ResetVerdict | null => {
	if (customerEntitlement.expired === true) return null;

	const customerProduct = customerEntitlement.customer_product;
	if (customerProduct?.status !== CusProductStatus.Expired) return null;

	return {
		kind: "should_expire",
		customerEntitlementId: customerEntitlement.id,
	};
};
