import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	isOneOffProduct,
} from "@autumn/shared";

export const isOneOffAttachWithNothingToCharge = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	isOneOffProduct({ product: billingContext.attachProduct }) &&
	(autumnBillingPlan.lineItems ?? []).every(
		(lineItem) => lineItem.amount === 0,
	);
