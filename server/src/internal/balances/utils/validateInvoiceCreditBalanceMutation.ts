import { ErrCode, RecaseError } from "@autumn/shared";
import {
	isInvoiceCreditCustomerEntitlement,
	type StampedCustomerEntitlement,
} from "@/internal/features/invoiceCredits/isInvoiceCreditCustomerEntitlement.js";

export const INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE =
	"Invoice-credit balances can only be changed through tracked usage and billing-cycle resets";

const rejectInvoiceCreditMutation = (): never => {
	throw new RecaseError({
		message: INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const validateInvoiceCreditBalanceMutation = ({
	customerEntitlement,
}: {
	customerEntitlement?: StampedCustomerEntitlement | null;
}): void => {
	if (isInvoiceCreditCustomerEntitlement({ customerEntitlement })) {
		rejectInvoiceCreditMutation();
	}
};

export const validateInvoiceCreditBalanceMutationForFeature = ({
	customerEntitlements,
	featureId,
}: {
	customerEntitlements: StampedCustomerEntitlement[];
	featureId: string;
}): void => {
	const itemized = customerEntitlements.some(
		(customerEntitlement) =>
			customerEntitlement.entitlement.feature.id === featureId &&
			isInvoiceCreditCustomerEntitlement({ customerEntitlement }),
	);
	if (itemized) rejectInvoiceCreditMutation();
};
