import type {
	AttachParamsV1,
	MultiAttachParamsV0,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const setupInvoiceModeContext = ({
	params,
}: {
	params: UpdateSubscriptionV1Params | AttachParamsV1 | MultiAttachParamsV0;
}) => {
	if (params?.invoice_mode?.enabled !== true) {
		return undefined;
	}

	return {
		finalizeInvoice: params.invoice_mode?.finalize,
		enableProductImmediately: params.invoice_mode?.enable_plan_immediately,
	};
};
