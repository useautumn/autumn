import type { BillingContext, StripeBillingPlan } from "@autumn/shared";
import { customerProductsToPricesWithProduct } from "@/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logStripeBillingPlan = ({
	ctx,
	stripeBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	stripeBillingPlan: StripeBillingPlan;
	billingContext: BillingContext;
}) => {
	const pricesWithProduct = customerProductsToPricesWithProduct({
		customerProducts: billingContext.fullCustomer.customer_products,
	});

	const {
		invoiceAction,
		subscriptionAction,
		refundAction,
		...restBillingPlan
	} = stripeBillingPlan;

	const refund = refundAction
		? `${refundAction.amountInCents} cents from charge ${refundAction.chargeId} (invoice ${refundAction.stripeInvoiceId})`
		: undefined;

	// const subscription =
	// 	subscriptionAction?.type === "create" || subscriptionAction?.type === "update"
	// 		? {
	// 				type: subscriptionAction.type,
	// 				items: subscriptionAction.params.items?.map((item) =>
	// 					formatPhaseItemWithAutumnPrice({ item, pricesWithProduct }),
	// 				),
	// 			}
	// 		: subscriptionAction
	// 			? { type: subscriptionAction.type }
	// 			: undefined;

	addToExtraLogs({
		ctx,
		extras: {
			stripeBillingPlan: {
				...restBillingPlan,
				subscription: subscriptionAction,
				addInvoiceLines: invoiceAction?.addLineParams?.lines.map(
					(line) =>
						`${line.description}: ${line.amount ?? line.price_data?.unit_amount}`,
				),
				refund,
			},
		},
	});
};
