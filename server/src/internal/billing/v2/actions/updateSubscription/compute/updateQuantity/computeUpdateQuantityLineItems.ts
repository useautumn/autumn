import type { BillingContext } from "@autumn/shared";
import {
	BILLING_AMOUNT_EPSILON,
	type BillingPeriod,
	cloneEntitlementWithUpdatedQuantity,
	cusEntToCusPrice,
	cusProductToCusEnts,
	type Feature,
	type FullCusProduct,
	findPrepaidCustomerEntitlement,
	InternalError,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
	priceToProrationConfig,
	sumValues,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRefundLineItemsForPrice } from "@/internal/billing/v2/utils/lineItems/getRefundLineItemsForPrice";

export const computeUpdateQuantityLineItems = ({
	ctx,
	billingContext,
	customerProduct,
	feature,
	billingPeriod,
	quantityDifferenceForEntitlements,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
	feature: Feature;
	billingPeriod?: BillingPeriod;
	quantityDifferenceForEntitlements: number;
	currentEpochMs: number;
}) => {
	const { org } = ctx;
	const customerEntitlements = cusProductToCusEnts({ customerProduct });

	const prepaidCustomerEntitlement = findPrepaidCustomerEntitlement({
		customerEntitlements,
		feature,
	});

	if (!prepaidCustomerEntitlement) {
		throw new InternalError({
			message: `[Quantity Update] Prepaid customer entitlement not found for feature: ${feature.internal_id}`,
		});
	}

	const customerPrice = cusEntToCusPrice({
		cusEnt: prepaidCustomerEntitlement,
	});

	if (!customerPrice) {
		throw new InternalError({
			message: `[Quantity Update] Prepaid customer price not found for feature: ${feature.internal_id}`,
		});
	}

	// Get proration config based on price and direction (upgrade/downgrade)
	const isUpgrade = quantityDifferenceForEntitlements > 0;
	const { shouldApplyProration, chargeImmediately, skipLineItems } =
		priceToProrationConfig({
			price: customerPrice.price,
			isUpgrade,
		});

	if (skipLineItems) {
		return [];
	}

	// Clone entitlement with updated quantity for the charge line item
	const newCustomerEntitlement = cloneEntitlementWithUpdatedQuantity({
		customerEntitlement: prepaidCustomerEntitlement,
		feature,
		quantityDifference: quantityDifferenceForEntitlements,
	});

	const lineItemContext: LineItemContext = {
		price: customerPrice?.price,
		product: customerProduct.product,
		feature,
		currency: orgToCurrency({ org }),
		direction: "charge",
		now: currentEpochMs,
		billingTiming: "in_advance",
		billingPeriod,
		customerProduct,
	};

	const catalogRefundLineItem = usagePriceToLineItem({
		cusEnt: prepaidCustomerEntitlement,
		context: {
			...lineItemContext,
			direction: "refund",
		},
		options: {
			shouldProrateOverride: shouldApplyProration,
			chargeImmediatelyOverride: chargeImmediately,
		},
	});

	const refundLineItems = getRefundLineItemsForPrice({
		ctx,
		customerProduct,
		billingContext,
		priceId: customerPrice.price.id,
		catalogFallback: catalogRefundLineItem,
	});

	const chargeLineItem = usagePriceToLineItem({
		cusEnt: newCustomerEntitlement,
		context: lineItemContext,
		options: {
			shouldProrateOverride: shouldApplyProration,
			chargeImmediatelyOverride: chargeImmediately,
		},
	});

	const netAmount = Math.abs(
		sumValues([
			...refundLineItems.map((li) => li.amountAfterDiscounts ?? 0),
			chargeLineItem?.amountAfterDiscounts ?? 0,
		]),
	);

	if (netAmount < BILLING_AMOUNT_EPSILON) return [];

	return [...refundLineItems, chargeLineItem].filter(
		(li): li is LineItem => li !== undefined,
	);
};
