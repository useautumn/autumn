import type {
	AttachParamsV1,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const setupInvoiceModeContext = ({
	params,
}: {
	params: UpdateSubscriptionV1Params | AttachParamsV1;
}) => {
	if (params?.invoice_mode?.enabled !== true) {
		return undefined;
	}

	return {
		finalizeInvoice: params.invoice_mode?.finalize_invoice === true,
		enableProductImmediately:
			params.invoice_mode?.enable_product_immediately !== false,
	};
};
