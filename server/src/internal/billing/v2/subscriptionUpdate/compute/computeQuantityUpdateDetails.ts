import {
	cusProductToProduct,
	extractBillingPeriod,
	type FeatureOptions,
	findFeatureByInternalId,
	InternalError,
	type LineItemContext,
} from "@autumn/shared";
import { usagePriceToLineDescription } from "@autumn/shared/utils/billingUtils/invoicingUtils/descriptionUtils/usagePriceToLineDescription";
import type Stripe from "stripe";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { QuantityUpdateDetails } from "@/internal/billing/v2/typesOld";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { calculateEntitlementChange } from "./quantityUpdateUtils/calculateEntitlementChange";
import { calculateProrationAmount } from "./quantityUpdateUtils/calculateProrationAmount";
import { calculateQuantityDifferences } from "./quantityUpdateUtils/calculateQuantityDifferences";
import { resolvePriceForQuantityUpdate } from "./quantityUpdateUtils/resolvePriceForQuantityUpdate";

/**
 * Computes all details needed for a feature quantity update operation.
 *
 * Orchestrates extraction of price config, quantity differences, billing period,
 * proration amounts, and entitlement changes. Pure function with no side effects.
 *
 * @param ctx - Autumn context with features
 * @param previousOptions - Current feature options
 * @param updatedOptions - Desired feature options
 * @param updateSubscriptionContext - Context containing customerProduct, stripeSubscription, currentEpochMs
 * @returns Complete details for executing the quantity update
 * @throws {InternalError} When internal_feature_id is missing or feature not found
 */
export const computeQuantityUpdateDetails = ({
	ctx,
	previousOptions,
	updatedOptions,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	updateSubscriptionContext: UpdateSubscriptionContext;
}): QuantityUpdateDetails => {
	const { customerProduct, stripeSubscription, currentEpochMs } =
		updateSubscriptionContext;
	const { features } = ctx;

	const internalFeatureId = updatedOptions.internal_feature_id;
	const featureId = updatedOptions.feature_id;

	if (!internalFeatureId) {
		throw new InternalError({
			message: `[Quantity Update] internal_feature_id is required for quantity updates`,
		});
	}

	if (!stripeSubscription) {
		throw new InternalError({
			message: `[Quantity Update] Stripe subscription not found`,
		});
	}

	const feature = findFeatureByInternalId({
		features,
		internalId: internalFeatureId,
	});

	if (!feature) {
		throw new InternalError({
			message: `[Quantity Update] Feature not found for internal_id: ${internalFeatureId}`,
		});
	}

	const quantityDifferences = calculateQuantityDifferences({
		previousOptions,
		updatedOptions,
	});

	const priceConfiguration = resolvePriceForQuantityUpdate({
		customerProduct,
		updatedOptions,
		isUpgrade: quantityDifferences.isUpgrade,
	});

	const billingPeriod = extractBillingPeriod({
		stripeSubscription,
		interval: priceConfiguration.priceConfig.interval,
		intervalCount: priceConfiguration.priceConfig.interval_count,
		currentEpochMs,
	});

	const calculatedProrationAmountDollars = calculateProrationAmount({
		previousOptions,
		updatedOptions,
		priceConfiguration,
		quantityDifferences,
		stripeSubscription,
		billingPeriod,
		currentEpochMs,
	});

	const product = cusProductToProduct({ cusProduct: customerProduct });

	const lineItemContext: LineItemContext = {
		price: priceConfiguration.price,
		product,
		feature,
		currency: "usd",
		direction: "charge",
		now: currentEpochMs,
		billingTiming: "in_advance",
	};

	const stripeInvoiceItemDescription = usagePriceToLineDescription({
		usage: updatedOptions.quantity,
		context: lineItemContext,
	});

	const existingStripeSubscriptionItem = findStripeItemForPrice({
		price: priceConfiguration.price,
		stripeItems: stripeSubscription.items.data,
	}) as Stripe.SubscriptionItem | undefined;

	const entitlementChange = calculateEntitlementChange({
		quantityDifferenceForEntitlements:
			quantityDifferences.quantityDifferenceForEntitlements,
		billingUnitsPerQuantity: priceConfiguration.billingUnitsPerQuantity,
		customerPrice: priceConfiguration.customerPrice,
		customerEntitlements: customerProduct.customer_entitlements,
	});

	if (!priceConfiguration.price.config.stripe_price_id) {
		throw new InternalError({
			message: `[Quantity Update] Stripe price ID not found for price: ${priceConfiguration.price.id}`,
		});
	}

	return {
		featureId,
		internalFeatureId,
		previousFeatureQuantity: previousOptions.quantity,
		updatedFeatureQuantity: updatedOptions.quantity,
		quantityDifferenceForEntitlements:
			quantityDifferences.quantityDifferenceForEntitlements,
		stripeSubscriptionItemQuantityDifference:
			quantityDifferences.stripeSubscriptionItemQuantityDifference,
		shouldApplyProration: priceConfiguration.shouldApplyProration,
		shouldFinalizeInvoiceImmediately:
			priceConfiguration.shouldFinalizeInvoiceImmediately,
		billingUnitsPerQuantity: priceConfiguration.billingUnitsPerQuantity,
		calculatedProrationAmountDollars,
		subscriptionPeriodStartEpochMs:
			billingPeriod.subscriptionPeriodStartEpochMs,
		subscriptionPeriodEndEpochMs: billingPeriod.subscriptionPeriodEndEpochMs,
		stripeInvoiceItemDescription,
		customerPrice: priceConfiguration.customerPrice,
		stripePriceId: priceConfiguration.price.config.stripe_price_id,
		existingStripeSubscriptionItem,
		customerEntitlementId: entitlementChange.customerEntitlementId,
		customerEntitlementBalanceChange:
			entitlementChange.customerEntitlementBalanceChange,
	};
};
