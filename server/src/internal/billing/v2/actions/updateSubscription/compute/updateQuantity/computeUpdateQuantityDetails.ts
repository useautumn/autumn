import type { DbPooledBalanceContribution } from "@autumn/shared";
import {
	addCusProductToCusEnt,
	customerPriceToCustomerEntitlement,
	type FeatureOptions,
	findFeatureByInternalId,
	findFeatureOptionsByFeature,
	findPrepaidQuantityTargetPrice,
	InternalError,
	isOneOffPrice,
	isPrepaidPrice,
	type LineItem,
	RecaseError,
	type UpdateCustomerEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeFeatureOptionsChange } from "@/internal/billing/v2/actions/updateSubscription/compute/updateQuantity/computeFeatureOptionsChange";
import { getLineItemBillingPeriod } from "@/internal/billing/v2/utils/lineItems/getLineItemBillingPeriod";
import { calculateUpdateQuantityDifferences } from "./calculateUpdateQuantityDifferences.js";
import { computeUpdateQuantityCustomerEntitlementChanges } from "./computeUpdateQuantityCustomerEntitlementChanges.js";
import { computeUpdateQuantityLineItems } from "./computeUpdateQuantityLineItems.js";
import { computeUpdateQuantityPooledContributionUpdate } from "./computeUpdateQuantityPooledContributionUpdate.js";

/** Computes quantity differences, billing lines and entitlement updates without side effects. */
export const computeUpdateQuantityDetails = ({
	ctx,
	updatedOptions,
	updateSubscriptionContext,
	applyImmediately = false,
}: {
	ctx: AutumnContext;
	updatedOptions: FeatureOptions;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	applyImmediately?: boolean;
}): {
	featureId: string;
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
	lineItems: LineItem[];
	updatedOptions: FeatureOptions;
	pooledContributionUpdate: DbPooledBalanceContribution | null;
} => {
	const { customerProduct, currentEpochMs, billingCycleAnchorMs } =
		updateSubscriptionContext;
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
		errorOnNotFound: true,
	});

	const previousOptions = findFeatureOptionsByFeature({
		featureOptions: customerProduct.options,
		feature,
		logger: ctx.logger,
	});

	const quantityDifferences = calculateUpdateQuantityDifferences({
		previousOptions,
		updatedOptions,
	});

	// Tie-break: pick the prepaid price the quantity resolves to — a recurring
	// prepaid wins over a one-off prepaid sibling of the same feature.
	const prepaidCustomerPrices = customerProduct.customer_prices.filter(
		(customerPriceCandidate) => isPrepaidPrice(customerPriceCandidate.price),
	);
	const targetPrice = findPrepaidQuantityTargetPrice({
		prices: prepaidCustomerPrices.map(
			(customerPriceCandidate) => customerPriceCandidate.price,
		),
		internalFeatureId,
		featureId,
	});
	const customerPrice = prepaidCustomerPrices.find(
		(customerPriceCandidate) =>
			customerPriceCandidate.price.id === targetPrice?.id,
	);

	if (!customerPrice) {
		throw new InternalError({
			message: `Customer price not found for internal_feature_id: ${internalFeatureId}`,
		});
	}

	if (isOneOffPrice(customerPrice.price)) {
		throw new RecaseError({
			message: `Not allowed to update feature quantity for one off items.`,
			statusCode: 400,
		});
	}

	const customerEntitlement = customerPriceToCustomerEntitlement({
		customerPrice,
		customerEntitlements: customerProduct.customer_entitlements,
		errorOnNotFound: true,
	});

	const cusEntWithCusProduct = addCusProductToCusEnt({
		cusEnt: customerEntitlement,
		cusProduct: customerProduct,
	});

	updatedOptions = computeFeatureOptionsChange({
		applyImmediately,
		previousOptions,
		updatedOptions,
		quantityDifferenceForEntitlements:
			quantityDifferences.quantityDifferenceForEntitlements,
		customerPrice,
	});

	const updateCustomerEntitlements =
		computeUpdateQuantityCustomerEntitlementChanges({
			applyImmediately,
			ctx,
			updateSubscriptionContext,
			quantityDifference: quantityDifferences.quantityDifferenceForEntitlements,
			customerEntitlement: cusEntWithCusProduct,
		});

	if (!billingCycleAnchorMs) {
		throw new InternalError({
			message: `[Quantity Update] billingCycleAnchorMs is required (no active subscription)`,
		});
	}

	const billingPeriod = getLineItemBillingPeriod({
		billingContext: updateSubscriptionContext,
		price: customerPrice.price,
	});

	if (!billingPeriod) {
		throw new InternalError({
			message: `[Quantity Update] Billing period not found for price: ${customerPrice.price.id}`,
		});
	}

	const lineItems = computeUpdateQuantityLineItems({
		ctx,
		billingContext: updateSubscriptionContext,
		customerProduct,
		prepaidCustomerEntitlement: cusEntWithCusProduct,
		feature,
		billingPeriod,
		quantityDifferenceForEntitlements:
			quantityDifferences.quantityDifferenceForEntitlements,
		currentEpochMs,
	});

	const pooledContributionUpdate =
		computeUpdateQuantityPooledContributionUpdate({
			customerEntitlement,
			customerProduct,
			updatedOptions,
			effectiveAt: billingPeriod.end,
			now: currentEpochMs,
		});

	return {
		featureId,
		updateCustomerEntitlements,
		lineItems,
		updatedOptions,
		pooledContributionUpdate,
	};
};
