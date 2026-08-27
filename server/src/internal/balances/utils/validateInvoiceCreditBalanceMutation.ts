import { ErrCode, type Feature, RecaseError } from "@autumn/shared";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";

export const INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE =
	"Invoice-credit balances can only be changed through tracked usage and billing-cycle resets";

export const validateInvoiceCreditBalanceMutation = ({
	feature,
}: {
	feature?: Feature;
}): void => {
	if (!isInvoiceCreditFeature({ feature })) return;

	throw new RecaseError({
		message: INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
