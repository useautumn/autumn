import type {
	AttachParamsV1,
	MultiAttachParamsV0,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

// Legacy V0 invoice-mode fields are still accepted on V1 attach/update
// schemas (see billingParamsBaseV1.ts). When `invoice_mode` is omitted but
// the legacy `invoice` flag is set, promote the flat fields into the
// structured shape so `billingContext.invoiceMode` is populated correctly.
type InvoiceModeLegacyAliases = {
	invoice?: boolean;
	enable_product_immediately?: boolean;
	finalize_invoice?: boolean;
};

export const setupInvoiceModeContext = ({
	params,
}: {
	params:
		| (UpdateSubscriptionV1Params & InvoiceModeLegacyAliases)
		| (AttachParamsV1 & InvoiceModeLegacyAliases)
		| MultiAttachParamsV0;
}) => {
	const structured = params?.invoice_mode;
	const legacyParams = params as InvoiceModeLegacyAliases;
	const legacyEnabled = legacyParams.invoice === true;

	const enabled = structured?.enabled === true || legacyEnabled;
	if (!enabled) {
		return undefined;
	}

	// Match `InvoiceModeParamsSchema` defaults (`finalize: true`,
	// `enable_plan_immediately: false`) when the legacy aliases are used so
	// downstream code sees the same shape regardless of which input form
	// the caller used.
	const finalizeInvoice =
		structured?.finalize ?? legacyParams.finalize_invoice ?? true;
	const enableProductImmediately =
		structured?.enable_plan_immediately ??
		legacyParams.enable_product_immediately ??
		false;

	return {
		finalizeInvoice,
		enableProductImmediately,
	};
};
