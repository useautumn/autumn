import {
	type BillingContext,
	type FullCusProduct,
	filterCustomerProductsByActiveStatuses,
	isPrepaidPrice,
	priceUtils,
	type StripeItemSpec,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductsToOneOffStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToOneOffStripeItemSpecs";
import { customerProductsToRecurringStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/customerProductsToRecurringStripeItemSpecs";
import { filterStripeItemSpecsByLargestInterval } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/filterStripeItemSpecsByLargestInterval";
import { stripeItemSpecToCheckoutLineItem } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/stripeItemSpecToStripeParam";
import { updateOneOffTieredItems } from "./updateOneOffTieredItems";

const isZeroAmountInlineLineItem = ({
	lineItem,
}: {
	lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
}) => {
	if (!("price_data" in lineItem) || !lineItem.price_data) return false;

	return (
		lineItem.price_data.unit_amount === 0 ||
		lineItem.price_data.unit_amount_decimal === "0"
	);
};

const isZeroAmountInlineRecurringStripeItemSpec = ({
	stripeItemSpec,
}: {
	stripeItemSpec: StripeItemSpec;
}) => {
	if (!stripeItemSpec.stripeInlinePrice?.recurring) return false;

	return stripeItemSpec.stripeInlinePrice.unit_amount_decimal === "0";
};

const getRecurringCadenceKey = ({
	stripeItemSpec,
}: {
	stripeItemSpec: StripeItemSpec;
}) => {
	const recurring = stripeItemSpec.stripeInlinePrice?.recurring;
	if (recurring) {
		return JSON.stringify({
			interval: recurring.interval,
			intervalCount: recurring.interval_count ?? 1,
		});
	}

	const price = stripeItemSpec.autumnPrice;
	if (!price) return "unknown";

	return JSON.stringify({
		interval: price.config.interval,
		intervalCount: price.config.interval_count ?? 1,
	});
};

const filterRecurringStripeItemSpecsForCheckout = ({
	stripeItemSpecs,
}: {
	stripeItemSpecs: StripeItemSpec[];
}) => {
	return stripeItemSpecs.filter((stripeItemSpec, index) => {
		if (!isZeroAmountInlineRecurringStripeItemSpec({ stripeItemSpec })) {
			return true;
		}

		const recurringCadenceKey = getRecurringCadenceKey({ stripeItemSpec });

		const hasNonZeroSiblingWithSameRecurring = stripeItemSpecs.some(
			(otherStripeItemSpec, otherIndex) =>
				otherIndex !== index &&
				getRecurringCadenceKey({ stripeItemSpec: otherStripeItemSpec }) ===
					recurringCadenceKey &&
				!isZeroAmountInlineRecurringStripeItemSpec({
					stripeItemSpec: otherStripeItemSpec,
				}),
		);

		return !hasNonZeroSiblingWithSameRecurring;
	});
};

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
	recurringStripeItemSpecs = filterRecurringStripeItemSpecsForCheckout({
		stripeItemSpecs: recurringStripeItemSpecs,
	});

	// 5. Convert recurring item specs to line items
	const recurringLineItems = recurringStripeItemSpecs.map((item) => {
		const { autumnPrice, autumnEntitlement } = item;
		const lineItem = stripeItemSpecToCheckoutLineItem({ spec: item });

		// If it's a prepaid price, allow adjustable quantity
		if (autumnPrice && autumnEntitlement && isPrepaidPrice(autumnPrice)) {
			const feature = autumnEntitlement.feature;
			const isAdjustable = billingContext.adjustableFeatureQuantities?.includes(
				feature.id,
			);

			return {
				...lineItem,
				adjustable_quantity: isAdjustable
					? {
							enabled: true,
							minimum: priceUtils.convert.toAllowanceInPacks({
								price: autumnPrice,
								entitlement: autumnEntitlement,
							}),
							maximum: 999999,
						}
					: undefined,
			} as Stripe.Checkout.SessionCreateParams.LineItem;
		}

		return lineItem;
	});

	// 6. Convert one-off item specs to line items (handles tiered one-off prices)
	const oneOffLineItems = updateOneOffTieredItems({
		oneOffItemSpecs,
		org: ctx.org,
	}).filter((lineItem) => !isZeroAmountInlineLineItem({ lineItem }));

	return { recurringLineItems, oneOffLineItems };
};
