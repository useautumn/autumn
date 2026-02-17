import type {
	AttachParamsV1,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const setupInvoiceModeContext = ({
	params,
}: {
	params: UpdateSubscriptionV1Params | AttachParamsV1;
}) => {
	if (params?.invoice !== true) {
		return undefined;
	}

	return {
		finalizeInvoice: params.finalize_invoice === true,
		enableProductImmediately: params.enable_product_immediately !== false,
	};
};
