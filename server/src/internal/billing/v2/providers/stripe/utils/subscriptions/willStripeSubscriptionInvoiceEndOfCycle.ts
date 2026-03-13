import {
AutumnBillingPlan, 	type BillingContext,
	type FullCusProduct,
	isConsumablePrice,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductsToRecurringStripeItemSpecs } from "../stripeItemSpec/customerProductsToRecurringStripeItemSpecs";

export const willStripeSubscriptionInvoiceEndOfCycle = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	// customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const newCustomerProducts = autumnBillingPlan.insertCustomerProducts;
	const stripeItemSpecs = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: newCustomerProducts,
	});

	return (
		stripeItemSpecs.length > 0 &&
		stripeItemSpecs.every(
			(item) => item.autumnPrice && isConsumablePrice(item.autumnPrice),
		)
	);
};
