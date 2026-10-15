import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { BillingCancelFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { billingPlanToChangedCustomerProducts } from "./billingPlanToChangedCustomerProducts";
import type { BillingPreviewTotals } from "./billingPreviewTotals";
import { findChangeCustomerProduct } from "./findChangeCustomerProduct";

/** Cancel, uncancel. The refund is the preview's, so a cap checks what will actually be refunded. */
export const buildBillingCancelFacts = ({
	billingContext,
	billingPlan,
	preview,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
}): BillingCancelFacts => {
	const { before } = billingPlanToChangedCustomerProducts({
		autumnBillingPlan: billingPlan.autumn,
	});
	const { cancelAction } = billingContext;

	return {
		customer: billingContext.fullCustomer,
		cancel_action:
			cancelAction === "cancel_immediately" ||
			cancelAction === "cancel_end_of_cycle"
				? cancelAction
				: null,
		outgoing: preview.outgoing.map((change) =>
			findChangeCustomerProduct({ change, customerProducts: before }),
		),
		refund: preview.refund ? { amount: preview.refund.amount } : null,
	};
};
