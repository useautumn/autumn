import type { Feature } from "@autumn/shared";
import { isInvoiceCreditFeature } from "../creditSystemUtils.js";

export type StampedCustomerEntitlement = {
	invoice_credit?: boolean | null;
	entitlement: { feature: Feature };
};

export const isInvoiceCreditCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement?: StampedCustomerEntitlement | null;
}): boolean => {
	if (!customerEntitlement) return false;
	return (
		customerEntitlement.invoice_credit ??
		isInvoiceCreditFeature({ feature: customerEntitlement.entitlement.feature })
	);
};
