import { ErrCode, type Feature, RecaseError } from "@autumn/shared";
import { isInvoiceCreditFeature } from "./creditSystemUtils.js";

export const validateInvoiceCreditPooling = ({
	feature,
	pooled,
}: {
	feature?: Feature;
	pooled?: boolean;
}): void => {
	if (!pooled || !isInvoiceCreditFeature({ feature })) return;

	throw new RecaseError({
		message: "Invoice-credit features cannot use pooled plan items",
		code: ErrCode.InvalidProductItem,
		statusCode: 400,
	});
};
