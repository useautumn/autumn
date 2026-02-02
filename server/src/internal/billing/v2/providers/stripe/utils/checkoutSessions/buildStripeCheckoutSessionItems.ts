import {
	type BillingContext,
	type FullCusProduct,
	filterCustomerProductsByActiveStatuses,
	isPrepaidPrice,
	priceUtils,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductsToOneOffStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToOneOffStripeItemSpecs";
import { customerProductsToRecurringStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToRecurringStripeItemSpecs";
import { filterStripeItemSpecsByLargestInterval } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/filterStripeItemSpecsByLargestInterval";
import { updateOneOffTieredItems } from "./updateOneOffTieredItems";

export const buildStripeCheckoutSessionItems = ({
	ctx,
	billingContext,
	newCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	newCustomerProducts: FullCusProduct[];
}): {
	recurringLineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
	oneOffLineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
} => {
	// 1. Filter customer products by active statuses
	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: newCustomerProducts,
	});

	// 2. Get recurring item specs (accumulated by price ID)
	let recurringStripeItemSpecs = customerProductsToRecurringStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	// 3. Get one-off item specs
	const oneOffItemSpecs = customerProductsToOneOffStripeItemSpecs({
		ctx,
		billingContext,
		customerProducts: activeCustomerProducts,
	});

	// 4. Filter recurring items by largest interval (for Stripe Checkout)
	recurringStripeItemSpecs = filterStripeItemSpecsByLargestInterval({
		stripeItemSpecs: recurringStripeItemSpecs,
	});

	// 5. Convert recurring item specs to line items
	const recurringLineItems = recurringStripeItemSpecs.map((item) => {
		const { autumnPrice, quantity, stripePriceId, autumnEntitlement } = item;

		// If it's a prepaid price, allow adjustable quantity
		if (autumnPrice && autumnEntitlement && isPrepaidPrice(autumnPrice)) {
			return {
				price: stripePriceId,
				quantity: quantity ?? 0,
				// adjustable_quantity: {
				// 	enabled: true,
				// 	minimum: priceUtils.convert.toAllowanceInPacks({
				// 		price: autumnPrice,
				// 		entitlement: autumnEntitlement,
				// 	}),
				// 	maximum: 999999,
				// },
			} as Stripe.Checkout.SessionCreateParams.LineItem;
		}

		// Fixed price
		return {
			price: stripePriceId,
			quantity: quantity ?? 0,
		};
	});

	// 6. Convert one-off item specs to line items (handles tiered one-off prices)
	const oneOffLineItems = updateOneOffTieredItems({
		oneOffItemSpecs,
		org: ctx.org,
	});

	return { recurringLineItems, oneOffLineItems };
};
