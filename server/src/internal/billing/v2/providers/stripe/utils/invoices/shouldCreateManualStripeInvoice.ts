import {
	type AutumnBillingPlan,
	type BillingContext,
	type FullCusProduct,
	type StripeSubscriptionAction,
	sumValues,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";
import { willStripeSubscriptionInvoiceEndOfCycle } from "../subscriptions/willStripeSubscriptionInvoiceEndOfCycle";

const lineItemsCharge = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	sumValues(
		(autumnBillingPlan.lineItems ?? []).map(
			(lineItem) => lineItem.amountAfterDiscounts,
		),
	) !== 0;

export const shouldCreateManualStripeInvoice = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	stripeSubscriptionAction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	const isCreateAction = stripeSubscriptionAction?.type === "create";
	// A backdate recreate bills nothing until the old period end, so its plan changes are invoiced on their own.
	if (isCreateAction && isBackdateRecreate({ billingContext })) {
		return lineItemsCharge({ autumnBillingPlan });
	}
	if (isCreateAction) {
		const willCreateInvoiceEndOfCycle = willStripeSubscriptionInvoiceEndOfCycle(
			{
				ctx,
				billingContext,
				autumnBillingPlan,
			},
		);

		return willCreateInvoiceEndOfCycle;
	}

	// Custom line items always need a manual invoice
	const customLineItems = autumnBillingPlan.customLineItems;
	if (customLineItems?.length) {
		const customTotal = sumValues(customLineItems.map((item) => item.amount));
		return customTotal !== 0;
	}

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) {
		return lineItemsCharge({ autumnBillingPlan });
	}

	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction,
	});

	if (updateWillCreateInvoice) return false;

	return true;
};
