import { customerProductsToPricesWithProduct } from "@/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/types";
import type { StripeBillingPlan } from "@/internal/billing/v2/types";
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

	const { invoiceAction, subscriptionAction, ...restBillingPlan } =
		stripeBillingPlan;

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
					(line) => `${line.description}: ${line.amount}`,
				),
			},
		},
	});
};
