import type { InvoiceModeParams } from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const attachParamsToInvoiceModeParams = ({
	attachParams,
}: {
	attachParams: AttachParams;
}): InvoiceModeParams | undefined => {
	return attachParams.invoiceOnly
		? {
				enabled: attachParams.invoiceOnly,
				enable_plan_immediately: attachParams.enableProductImmediately ?? false,
				finalize: attachParams.finalizeInvoice ?? true,
			}
		: undefined;
};
