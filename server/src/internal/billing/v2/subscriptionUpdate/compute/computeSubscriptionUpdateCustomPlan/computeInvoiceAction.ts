import {
	type FullCusProduct,
	isCusProductTrialing,
	isCustomerProductFree,
	isCustomerProductOneOff,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	StripeInvoiceAction,
	StripeSubscriptionAction,
} from "@/internal/billing/v2/billingPlan";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import type { UpdateSubscriptionContext } from "@/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import { lineItemsToStripeLines } from "@/internal/billing/v2/utils/stripeAdapter/invoiceLines/lineItemsToStripeLines";

export const computeInvoiceAction = ({
	ctx,
	billingContext,
	newCustomerProduct,
	stripeSubscriptionAction,
	billingCycleAnchor,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionContext;
	newCustomerProduct: FullCusProduct;
	stripeSubscriptionAction?: StripeSubscriptionAction;
	billingCycleAnchor?: number;
}): StripeInvoiceAction | undefined => {
	if (isCusProductTrialing({ cusProduct: newCustomerProduct })) {
		return undefined;
	}

	/**
	 * Cases:
	 * One off -> Recurring (subscription created)
	 * One off -> Free...? (no subscription action)
	 * Free -> Recurring (subscription created)
	 * Free -> One off (invoice needed...?)
	 * Recurring -> Free (subscription canceled)
	 * Recurring -> One off (subscription canceled... need... invoice?)
	 */

	const fromCustomerProduct = billingContext.customerProduct;
	const toCustomerProduct = newCustomerProduct;

	if (
		isCustomerProductFree(fromCustomerProduct) &&
		isCustomerProductOneOff(toCustomerProduct)
	) {
		return undefined;
	}

	// If subscription action is update, we need to create an invoice
	const stripeSubscriptionActionType = stripeSubscriptionAction?.type;
	if (stripeSubscriptionActionType === "update") {
		const autumnLineItems = buildAutumnLineItems({
			ctx,
			newCusProducts: [toCustomerProduct],
			ongoingCustomerProduct: fromCustomerProduct,
			billingCycleAnchor,
			testClockFrozenTime: billingContext.testClockFrozenTime,
		});

		const addLineParams = lineItemsToStripeLines({
			lineItems: autumnLineItems,
		});

		return {
			addLineParams: {
				lines: addLineParams,
			},
		};
	}
};
