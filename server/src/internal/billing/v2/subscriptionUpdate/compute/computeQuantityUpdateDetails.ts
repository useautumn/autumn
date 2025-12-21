import {
	cusProductToProduct,
	type Feature,
	type FeatureOptions,
	type FullCusProduct,
	findCusPriceByFeature,
	getFeatureInvoiceDescription,
	InternalError,
	OnDecrease,
	OnIncrease,
	priceToInvoiceAmount,
	secondsToMs,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils";
import {
	shouldBillNow,
	shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils";
import { notNullish } from "@/utils/genUtils";
import type { QuantityUpdateDetails } from "../../types";

/**
 * Compute all details for a single feature quantity update.
 * PURE FUNCTION - no side effects, only calculations.
 *
 * Extracted from:
 * - handleQuantityUpgrade.ts:58-206
 * - handleQuantityDowngrade.ts:53-198
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

	if (!updatedOptions.internal_feature_id) {
		throw new InternalError({
			message: `[Quantity Update] Missing internal_feature_id for feature: ${updatedOptions.feature_id}`,
		});
	}

	const customerPrice = findCusPriceByFeature({
		internalFeatureId: updatedOptions.internal_feature_id,
		cusPrices: customerProduct.customer_prices,
	});

	if (!customerPrice) {
		throw new InternalError({
			message: `[Quantity Update] Customer price not found for internal_feature_id: ${updatedOptions.internal_feature_id}`,
		});
	}

	const price = customerPrice.price;
	const priceConfig = price.config as UsagePriceConfig;
	const billingUnitsPerQuantity = priceConfig.billing_units || 1;

	const isUpgrade = updatedOptions.quantity > previousOptions.quantity;

	const prorationBehaviorConfig = isUpgrade
		? price.proration_config?.on_increase || OnIncrease.ProrateImmediately
		: price.proration_config?.on_decrease || OnDecrease.ProrateImmediately;

	const shouldApplyProration = shouldProrate(prorationBehaviorConfig);
	const shouldFinalizeInvoiceImmediately = shouldBillNow(
		prorationBehaviorConfig,
	);

	const quantityDifferenceForEntitlements = new Decimal(updatedOptions.quantity)
		.minus(previousOptions.quantity)
		.toNumber();

	const upcomingQuantityToConsider = notNullish(
		previousOptions.upcoming_quantity,
	)
		? previousOptions.upcoming_quantity
		: previousOptions.quantity;

	const stripeSubscriptionItemQuantityDifference = new Decimal(
		updatedOptions.quantity,
	)
		.minus(upcomingQuantityToConsider)
		.toNumber();

	const { start: periodStartSeconds, end: periodEndSeconds } =
		subToPeriodStartEnd({
			sub: stripeSubscription,
		});

	const periodStartMs = secondsToMs(periodStartSeconds);
	const periodEndMs = secondsToMs(periodEndSeconds);

	if (!periodStartMs || !periodEndMs) {
		throw new InternalError({
			message: `[Quantity Update] Invalid subscription period: start=${periodStartSeconds}, end=${periodEndSeconds}`,
		});
	}

	const subscriptionPeriodStartEpochMs: number = periodStartMs;
	const subscriptionPeriodEndEpochMs: number = periodEndMs;

	const isTrialing = stripeSubscription.status === "trialing";

	let calculatedProrationAmountDollars: number | undefined;
	if (shouldApplyProration && !isTrialing) {
		const previousQuantityActual = new Decimal(previousOptions.quantity)
			.mul(billingUnitsPerQuantity)
			.toNumber();
		const updatedQuantityActual = new Decimal(updatedOptions.quantity)
			.mul(billingUnitsPerQuantity)
			.toNumber();

		const previousAmountDollars = priceToInvoiceAmount({
			price,
			quantity: previousQuantityActual,
		});

		const updatedAmountDollars = priceToInvoiceAmount({
			price,
			quantity: updatedQuantityActual,
		});

		const amountDifferenceDollars = new Decimal(updatedAmountDollars).minus(
			previousAmountDollars,
		);

		const timeRemainingMs = new Decimal(subscriptionPeriodEndEpochMs).minus(
			currentEpochMs,
		);
		const totalPeriodMs = new Decimal(subscriptionPeriodEndEpochMs).minus(
			subscriptionPeriodStartEpochMs,
		);

		const proratedAmountDollars = timeRemainingMs
			.div(totalPeriodMs)
			.mul(amountDifferenceDollars);

		if (proratedAmountDollars.lte(0) && isUpgrade) {
			calculatedProrationAmountDollars = 0;
		} else {
			calculatedProrationAmountDollars = proratedAmountDollars.toNumber();
		}
	}

	const feature = features.find(
		(f: Feature) => f.internal_id === updatedOptions.internal_feature_id,
	);

	if (!feature) {
		throw new InternalError({
			message: `[Quantity Update] Feature not found for internal_id: ${updatedOptions.internal_feature_id}`,
		});
	}

	const product = cusProductToProduct({ cusProduct: customerProduct });

	const stripeInvoiceItemDescription = getFeatureInvoiceDescription({
		feature,
		usage: updatedOptions.quantity,
		billingUnits: billingUnitsPerQuantity,
		prodName: product.name,
		isPrepaid: true,
		fromUnix: currentEpochMs,
	});

	const existingStripeSubscriptionItem = findStripeItemForPrice({
		price,
		stripeItems: stripeSubscription.items.data,
	}) as Stripe.SubscriptionItem | undefined;

	const customerEntitlement = getRelatedCusEnt({
		cusPrice: customerPrice,
		cusEnts: customerProduct.customer_entitlements,
	});

	const customerEntitlementBalanceChange = new Decimal(
		quantityDifferenceForEntitlements,
	)
		.mul(billingUnitsPerQuantity)
		.toNumber();

	if (!price.config.stripe_price_id) {
		throw new InternalError({
			message: `[Quantity Update] Stripe price ID not found for price: ${price.id}`,
		});
	}

	return {
		featureId: updatedOptions.feature_id,
		internalFeatureId: updatedOptions.internal_feature_id,

		previousFeatureQuantity: previousOptions.quantity,
		updatedFeatureQuantity: updatedOptions.quantity,
		quantityDifferenceForEntitlements,
		stripeSubscriptionItemQuantityDifference,

		shouldApplyProration,
		shouldFinalizeInvoiceImmediately,
		billingUnitsPerQuantity,

		calculatedProrationAmountDollars,
		subscriptionPeriodStartEpochMs,
		subscriptionPeriodEndEpochMs,

		stripeInvoiceItemDescription,

		customerPrice,
		stripePriceId: price.config.stripe_price_id,
		existingStripeSubscriptionItem,

		customerEntitlementId: customerEntitlement?.id,
		customerEntitlementBalanceChange,
	};
};
