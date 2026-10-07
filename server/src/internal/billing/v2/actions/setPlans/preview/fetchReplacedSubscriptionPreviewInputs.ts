import {
	type BillingContext,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	type LineItem,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { listOpenStripeSubscriptionInvoices } from "@/external/stripe/invoices/operations/listOpenStripeSubscriptionInvoices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";

const isBilledByPlan = ({
	lineItem,
	billedLineItems,
}: {
	lineItem: LineItem;
	billedLineItems: LineItem[];
}) =>
	billedLineItems.some(
		(billed) =>
			billed.context.billingTiming === "in_arrear" &&
			billed.context.customerPrice?.id === lineItem.context.customerPrice?.id,
	);

/**
 * What the replaced subscription leaves behind: open invoices and arrear usage the plan never bills.
 * A backdate recreate bills that usage itself: now for plans that end, at renewal for kept ones.
 */
export const fetchReplacedSubscriptionPreviewInputs = async ({
	ctx,
	billingContext,
	outgoingCustomerProducts,
	billedLineItems,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	outgoingCustomerProducts: FullCusProduct[];
	billedLineItems: LineItem[];
}) => {
	const replacedStripeSubscription = billingContext.replacedStripeSubscription;
	if (!replacedStripeSubscription) {
		return { replacedOpenInvoices: [], unbilledUsageLineItems: [] };
	}

	const replacedOpenInvoices = await listOpenStripeSubscriptionInvoices({
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripeSubscriptionId: replacedStripeSubscription.id,
	});

	if (isBackdateRecreate({ billingContext })) {
		return { replacedOpenInvoices, unbilledUsageLineItems: [] };
	}

	const unbilledUsageLineItems = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: outgoingCustomerProducts,
		stripeSubscriptionId: replacedStripeSubscription.id,
	})
		.flatMap(
			(customerProduct) =>
				customerProductToArrearLineItems({
					ctx,
					customerProduct,
					billingContext: {
						...billingContext,
						stripeSubscription: replacedStripeSubscription,
					},
					options: {
						includePeriodDescription: false,
						updateNextResetAt: false,
						discountable: false,
					},
				}).lineItems,
		)
		.filter((lineItem) => !isBilledByPlan({ lineItem, billedLineItems }));

	return { replacedOpenInvoices, unbilledUsageLineItems };
};
