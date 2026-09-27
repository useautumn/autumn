import { isInvoiceCreditCustomerEntitlement } from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";

/** A balance edit that names no grant is a typo or an unassigned feature. */
export const assertBalanceRowsFound = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): void => {
	if (customerEntitlements.length === 0)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });
};

/** An invoice credit's balance mirrors an invoice, so only the invoice may move it. */
export const assertBalanceRowsMutable = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): void => {
	for (const customerEntitlement of customerEntitlements)
		if (isInvoiceCreditCustomerEntitlement({ customerEntitlement }))
			throw new UnsupportedCommandError({
				reason: "invoice_credit_not_mutable",
			});
};
