import {
	customerPriceToCustomerEntitlement,
	type FeatureOptions,
	type FullCustomerEntitlement,
	findCusPriceByFeature,
	findFeatureByInternalId,
	findFeatureOptionsByFeature,
	InternalError,
	isOneOffPrice,
	type LineItem,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { getLineItemBillingPeriod } from "@/internal/billing/v2/utils/lineItems/getLineItemBillingPeriod";
import { calculateUpdateQuantityDifferences } from "./calculateUpdateQuantityDifferences";
import { calculateUpdateQuantityEntitlementChange } from "./calculateUpdateQuantityEntitlementChange";
import { computeUpdateQuantityLineItems } from "./computeUpdateQuantityLineItems";

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
export const computeUpdateQuantityDetails = ({
	ctx,
	updatedOptions,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updatedOptions: FeatureOptions;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): {
	featureId: string;
	customerEntitlement: FullCustomerEntitlement;
	customerEntitlementBalanceChange: number;
	lineItems: LineItem[];
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
	});

	const quantityDifferences = calculateUpdateQuantityDifferences({
		previousOptions,
		updatedOptions,
	});

	const customerPrice = findCusPriceByFeature({
		internalFeatureId: internalFeatureId,
		cusPrices: customerProduct.customer_prices,
		errorOnNotFound: true,
	});

	if (isOneOffPrice(customerPrice.price)) {
		throw new RecaseError({
			message: `Not allowed to update feature quantity for one off items.`,
		});
	}

	const customerEntitlement = customerPriceToCustomerEntitlement({
		customerPrice,
		customerEntitlements: customerProduct.customer_entitlements,
		errorOnNotFound: true,
	});

	const { customerEntitlementBalanceChange } =
		calculateUpdateQuantityEntitlementChange({
			quantityDifferenceForEntitlements:
				quantityDifferences.quantityDifferenceForEntitlements,
			customerPrice,
			customerEntitlement,
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
		feature,
		billingPeriod,
		quantityDifferenceForEntitlements:
			quantityDifferences.quantityDifferenceForEntitlements,
		currentEpochMs,
	});

	return {
		featureId,
		customerEntitlement,
		customerEntitlementBalanceChange,
		lineItems,
	};
};
