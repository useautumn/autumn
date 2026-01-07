import type { BillingPreviewResponse } from "@autumn/shared";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const billingPlanToPreviewResponse = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
}): BillingPreviewResponse => {
	// 1. Get lines
	const autumnBillingPlan = billingPlan.autumn;

	// const previewLineItems = autumnBillingPlan.lineItems.map((line) => ({
	// 	description: line.description,
	// 	amount: line.amount,
	// }));

	// const total = autumnBillingPlanLines.reduce(
	// 	(acc, line) => acc + line.amount,
	// 	0,
	// );

	// return {
	// 	customer_id: billingPlan.customer_id,
	// };
};
