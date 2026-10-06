import type { BillingContext } from "@autumn/shared";
import { isDeferredInvoiceMode } from "./isDeferredInvoiceMode";

/** Invoice mode with enable-immediately: access starts once the invoice is finalized, not paid. */
export const isPlanEnabledOnFinalize = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean =>
	Boolean(billingContext.invoiceMode) &&
	!isDeferredInvoiceMode({ billingContext });
