import {
	ErrCode,
	RecaseError,
	sumValues,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";

/** Computes expected invoice total from line items that will be charged immediately */
const computeExpectedInvoiceTotal = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): number => {
	const lineItems = autumnBillingPlan.lineItems ?? [];
	return sumValues(
		lineItems
			.filter((line) => line.chargeImmediately)
			.map((line) => line.finalAmount),
	);
};

export const handleRefundBehaviorErrors = ({
	autumnBillingPlan,
	params,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	params: UpdateSubscriptionV0Params;
}) => {
	if (params.refund_behavior !== "refund_payment_method") return;

	// Check 1: refund_payment_method + next_cycle_only are incompatible
	if (params.billing_behavior === "next_cycle_only") {
		throw new RecaseError({
			message:
				"Cannot combine refund_behavior: 'refund_payment_method' with billing_behavior: 'next_cycle_only'. These behaviors are incompatible.",
		});
	}

	// Check 2: Invoice total must be negative (credit due) to issue a refund
	const expectedTotal = computeExpectedInvoiceTotal({ autumnBillingPlan });
	if (expectedTotal >= 0) {
		throw new RecaseError({
			message:
				"Cannot use refund_behavior: 'refund_payment_method' when invoice total is not negative. Refunds can only be issued when the customer is owed a credit (e.g., downgrade scenarios).",
		});
	}
};
