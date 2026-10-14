import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isInvoiceCreditFeature } from "../../featureUtils/classifyFeature/isInvoiceCreditFeature.js";

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
