import type { UpdateSubscriptionV0Params } from "@autumn/shared";

export const setupInvoiceModeContext = ({
	params,
}: {
	params: UpdateSubscriptionV0Params;
}) => {
	if (params?.invoice !== true) {
		return undefined;
	}

	return {
		finalizeInvoice: params.finalize_invoice === true,
		enableProductImmediately: params.enable_product_immediately !== false,
	};
};
