import type { BillingContext } from "@autumn/shared";
import { isDeferredInvoiceMode } from "./isDeferredInvoiceMode";

export const isImmediateInvoiceMode = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean =>
	Boolean(billingContext.invoiceMode) &&
	!isDeferredInvoiceMode({ billingContext });
