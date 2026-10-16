import {
	type BillingContext,
	type BillingPreviewChange,
	cusProductToProduct,
	type FullCusProduct,
} from "@autumn/shared";
import type { IncomingPlanFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { customerProductToFreeTrialFacts } from "./customerProductToFreeTrialFacts";
import { planIsCustomized } from "./planIsCustomized";

/** One preview `incoming` change as the customer would get it, customizations applied. */
export const changeToIncomingPlanFacts = ({
	billingContext,
	change,
	customerProduct,
}: {
	billingContext: BillingContext;
	change: BillingPreviewChange;
	customerProduct: FullCusProduct;
}): IncomingPlanFacts => ({
	product: cusProductToProduct({ cusProduct: customerProduct }),
	free_trial: customerProductToFreeTrialFacts({
		customerProduct,
		nowMs: billingContext.currentEpochMs,
	}),
	feature_quantities: change.feature_quantities,
	customized: planIsCustomized({ billingContext, customerProduct }),
});
