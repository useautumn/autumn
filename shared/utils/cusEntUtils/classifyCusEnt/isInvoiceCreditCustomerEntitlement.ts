import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isInvoiceCreditFeature } from "../../featureUtils/classifyFeature/isInvoiceCreditFeature.js";

export type StampedCustomerEntitlement = {
	invoice_credit?: boolean | null;
	entitlement: { feature: Feature };
};

/** The row's `invoice_credit` stamp wins; rows written before the stamp fall back to the feature's flag. */
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
