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

/**
 * Adds `adjustable_quantity` to a prepaid line item if the feature is marked adjustable.
 * Skips tiered one-off items that use inline `price_data` (quantity is pre-computed).
 */
const applyAdjustableQuantityToPrepaidLineItem = ({
	lineItem,
	spec,
	billingContext,
}: {
	lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
	spec: StripeItemSpec;
	billingContext: BillingContext;
}): Stripe.Checkout.SessionCreateParams.LineItem => {
	const { autumnPrice, autumnEntitlement } = spec;

	if (!autumnPrice || !autumnEntitlement || !isPrepaidPrice(autumnPrice)) {
		return lineItem;
	}

	// Tiered one-off items use inline price_data with quantity: 1, adjustable doesn't apply
	if ("price_data" in lineItem) {
		return lineItem;
	}

	const feature = autumnEntitlement.feature;
	const isAdjustable =
		billingContext.adjustableFeatureQuantities?.includes(feature.id);

	if (!isAdjustable) {
		return lineItem;
	}

	return {
		...lineItem,
		adjustable_quantity: {
			enabled: true,
			minimum: priceUtils.convert.toAllowanceInPacks({
				price: autumnPrice,
				entitlement: autumnEntitlement,
			}),
			maximum: 999999,
		},
	} as Stripe.Checkout.SessionCreateParams.LineItem;
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
		const lineItem = stripeItemSpecToCheckoutLineItem({ spec: item });
		return applyAdjustableQuantityToPrepaidLineItem({
			lineItem,
			spec: item,
			billingContext,
		});
	});

	// 6. Convert one-off item specs to line items (handles tiered one-off prices)
	const oneOffLineItems = updateOneOffTieredItems({
		oneOffItemSpecs,
		org: ctx.org,
	})
		.map((lineItem, index) =>
			applyAdjustableQuantityToPrepaidLineItem({
				lineItem,
				spec: oneOffItemSpecs[index],
				billingContext,
			}),
		)
		.filter((lineItem) => !isZeroAmountInlineLineItem({ lineItem }));

	return { recurringLineItems, oneOffLineItems };
};
