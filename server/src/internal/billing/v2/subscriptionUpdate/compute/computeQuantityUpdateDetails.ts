import {
	cusProductToProduct,
	extractBillingPeriod,
	type FeatureOptions,
	type FullCusProduct,
	findFeatureByInternalId,
	InternalError,
} from "@autumn/shared";
import { usagePriceToLineDescription } from "@autumn/shared/utils/billingUtils/invoicingUtils/descriptionUtils/usagePriceToLineDescription";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { QuantityUpdateDetails } from "@/internal/billing/v2/typesOld";
import { calculateEntitlementChange } from "./quantityUpdateUtils/calculateEntitlementChange";
import { calculateProrationAmount } from "./quantityUpdateUtils/calculateProrationAmount";
import { calculateQuantityDifferences } from "./quantityUpdateUtils/calculateQuantityDifferences";
import { mapStripeSubscriptionItem } from "./quantityUpdateUtils/mapStripeSubscriptionItem";
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
 * @param customerProduct - Full customer product with prices and entitlements
 * @param stripeSubscription - Active Stripe subscription
 * @param currentEpochMs - Current timestamp in milliseconds
 * @returns Complete details for executing the quantity update
 * @throws {InternalError} When internal_feature_id is missing or feature not found
 */
export const computeQuantityUpdateDetails = ({
	ctx,
	previousOptions,
	updatedOptions,
	customerProduct,
	stripeSubscription,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	customerProduct: FullCusProduct;
	stripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
}): QuantityUpdateDetails => {
	const { features } = ctx;

	const internalFeatureId = updatedOptions.internal_feature_id;
	const featureId = updatedOptions.feature_id;

	if (!internalFeatureId) {
		throw new InternalError({
			message: `[Quantity Update] internal_feature_id is required for quantity updates`,
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

	const stripeInvoiceItemDescription = usagePriceToLineDescription({
		price: priceConfiguration.price,
		feature,
		usage: updatedOptions.quantity,
		context: {
			price: priceConfiguration.price,
			product,
			feature,
			currency: "usd",
			direction: "charge",
			now: currentEpochMs,
			billingTiming: "in_advance",
			billingPeriod: {
				start: billingPeriod.subscriptionPeriodStartEpochMs,
				end: billingPeriod.subscriptionPeriodEndEpochMs,
			},
		},
	});

	const existingStripeSubscriptionItem = mapStripeSubscriptionItem({
		price: priceConfiguration.price,
		stripeSubscription,
	});

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
