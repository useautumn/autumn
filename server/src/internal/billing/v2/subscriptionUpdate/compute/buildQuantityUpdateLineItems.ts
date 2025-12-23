import {
	type BillingPeriod,
	cusEntToCusPrice,
	cusProductToCusEnts,
	type Feature,
	type FullCusProduct,
	findPrepaidCustomerEntitlement,
	InternalError,
	type LineItemContext,
	orgToCurrency,
	usagePriceToLineItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const buildQuantityUpdateLineItems = ({
	ctx,
	customerProduct,
	feature,
	billingPeriod,
	quantityDifferenceForEntitlements,
	currentEpochMs,
}: {
	ctx: AutumnContext;
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

	// New customer entitlement
	const newCustomerEntitlement = structuredClone(prepaidCustomerEntitlement);
	newCustomerEntitlement.balance = new Decimal(
		newCustomerEntitlement.balance ?? 0,
	)
		.add(quantityDifferenceForEntitlements) // does this include billing units?
		.toNumber();

	const lineItemContext: LineItemContext = {
		price: customerPrice?.price,
		product: customerProduct.product,
		feature,
		currency: orgToCurrency({ org }),
		direction: "charge",
		now: currentEpochMs,
		billingTiming: "in_arrear",
		billingPeriod,
	};

	const refundLineItem = usagePriceToLineItem({
		cusEnt: newCustomerEntitlement,
		context: {
			...lineItemContext,
			direction: "refund",
		},
	});

	const chargeLineItem = usagePriceToLineItem({
		cusEnt: prepaidCustomerEntitlement,
		context: lineItemContext,
	});

	return [refundLineItem, chargeLineItem];
};
