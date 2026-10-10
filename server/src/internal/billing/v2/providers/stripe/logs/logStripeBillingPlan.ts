import type { BillingContext, StripeBillingPlan } from "@autumn/shared";
import { customerProductsToPricesWithProduct } from "@/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";

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

	const {
		subscriptionScheduleAction,
		invoiceItemsAction,
		checkoutSessionAction,
		replacedSubscriptionAction,
	} = restBillingPlan;
	setRootSpanAttributes({
		// Empty when the plan leaves Stripe untouched.
		"billing.stripe_actions": [
			subscriptionAction &&
				subscriptionAction.type !== "none" &&
				`subscription.${subscriptionAction.type}`,
			subscriptionScheduleAction &&
				`subscription_schedule.${subscriptionScheduleAction.type}`,
			invoiceAction && "invoice",
			invoiceItemsAction && "invoice_items",
			checkoutSessionAction && "checkout_session",
			refundAction && "refund",
			replacedSubscriptionAction && "replaced_subscription",
		]
			.filter(Boolean)
			.join(","),
	});

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
