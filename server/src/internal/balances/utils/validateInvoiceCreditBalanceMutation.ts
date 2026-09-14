import { ErrCode, type Feature, RecaseError } from "@autumn/shared";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";
import { isInvoiceCreditCustomerEntitlement } from "@/internal/features/invoiceCredits/isInvoiceCreditCustomerEntitlement.js";

export const INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE =
	"Invoice-credit balances can only be changed through tracked usage and billing-cycle resets";

type GuardedCustomerEntitlement = {
	invoice_credit?: boolean | null;
	entitlement: { feature: Feature };
};

const rejectInvoiceCreditMutation = (): never => {
	throw new RecaseError({
		message: INVOICE_CREDIT_BALANCE_MUTATION_MESSAGE,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/** An itemized credit balance is only ever moved by tracked usage and cycle resets. */
export const validateInvoiceCreditBalanceMutation = ({
	customerEntitlement,
}: {
	customerEntitlement?: GuardedCustomerEntitlement | null;
}): void => {
	if (isInvoiceCreditCustomerEntitlement({ customerEntitlement })) {
		rejectInvoiceCreditMutation();
	}
};

/** Pre-enqueue hint for paths that must not load the subject; the worker re-checks against the stamp. */
export const validateInvoiceCreditFeatureMutation = ({
	feature,
}: {
	feature?: Feature;
}): void => {
	if (isInvoiceCreditFeature({ feature })) rejectInvoiceCreditMutation();
};

/** Feature-addressed writes: refuse when any of the customer's balances for the feature is itemized. */
export const validateInvoiceCreditBalanceMutationForFeature = ({
	customerEntitlements,
	featureId,
}: {
	customerEntitlements: (GuardedCustomerEntitlement & {
		entitlement: { feature: Feature };
	})[];
	featureId: string;
}): void => {
	const itemized = customerEntitlements.some(
		(customerEntitlement) =>
			customerEntitlement.entitlement.feature.id === featureId &&
			isInvoiceCreditCustomerEntitlement({ customerEntitlement }),
	);
	if (itemized) rejectInvoiceCreditMutation();
};
