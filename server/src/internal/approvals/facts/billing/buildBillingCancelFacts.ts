import type { BillingContext, BillingPlan } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	BillingCancelFacts,
	EntityFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { billingPlanToChangedCustomerProducts } from "./billingPlanToChangedCustomerProducts";
import type { BillingPreviewTotals } from "./billingPreviewTotals";
import { matchChangesToCustomerProducts } from "./matchChangesToCustomerProducts";

/** Cancel. The refund is the preview's, so a cap checks what will actually be refunded. */
export const buildBillingCancelFacts = ({
	billingContext,
	billingPlan,
	preview,
	customer,
	entity,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
	customer: ApprovalCustomerFacts;
	entity: EntityFacts;
}): BillingCancelFacts => {
	const { before } = billingPlanToChangedCustomerProducts({
		autumnBillingPlan: billingPlan.autumn,
	});
	const { cancelAction } = billingContext;

	return {
		customer,
		entity,
		cancel_action:
			cancelAction === "cancel_immediately" ||
			cancelAction === "cancel_end_of_cycle"
				? cancelAction
				: null,
		outgoing: matchChangesToCustomerProducts({
			changes: preview.outgoing,
			customerProducts: before,
		}),
		refund: preview.refund ? { amount: preview.refund.amount } : null,
	};
};
