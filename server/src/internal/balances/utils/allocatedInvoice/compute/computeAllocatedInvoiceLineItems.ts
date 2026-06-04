import {
	BILLING_AMOUNT_EPSILON,
	cusEntToCusPrice,
	InternalError,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
	priceToProrationConfig,
	sumValues,
	usagePriceToLineItem,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getLineItemBillingPeriod } from "@/internal/billing/v2/utils/lineItems/getLineItemBillingPeriod";
import { getRefundLineItemForPrice } from "@/internal/billing/v2/utils/lineItems/getRefundLineItemForPrice";
import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";
import { allocatedInvoiceIsUpgrade } from "./allocatedInvoiceIsUpgrade";

export const computeAllocatedInvoiceLineItems = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AllocatedInvoiceContext;
}) => {
	const { org } = ctx;

	const previousCustomerEntitlement = billingContext.customerEntitlement;
	const customerPrice = cusEntToCusPrice({
		cusEnt: previousCustomerEntitlement,
		errorOnNotFound: true,
	});
	const customerProduct = previousCustomerEntitlement.customer_product;

	if (!customerProduct) {
		throw new InternalError({
			message: `[Allocated Invoice Line Items] Customer product not found for customer entitlement: ${previousCustomerEntitlement.id}`,
		});
	}

	const { shouldApplyProration, skipLineItems, chargeImmediately } =
		priceToProrationConfig({
			price: customerPrice.price,
			isUpgrade: allocatedInvoiceIsUpgrade({
				billingContext,
			}),
		});

	if (
		skipLineItems ||
		isStripeSubscriptionTrialing(billingContext.stripeSubscription)
	)
		return [];

	const billingPeriod = getLineItemBillingPeriod({
		billingContext: billingContext,
		price: customerPrice.price,
	});

	const lineItemContext: LineItemContext = {
		price: customerPrice.price,
		product: customerProduct.product,
		feature: previousCustomerEntitlement.entitlement.feature,
		currency: orgToCurrency({ org }),
		direction: "charge",
		now: billingContext.currentEpochMs,
		billingTiming: "in_advance",
		billingPeriod,
		customerProduct,
	};

	const catalogRefundLineItem = usagePriceToLineItem({
		cusEnt: previousCustomerEntitlement,
		context: {
			...lineItemContext,
			direction: "refund",
		},
		options: {
			shouldProrateOverride: shouldApplyProration,
			chargeImmediatelyOverride: chargeImmediately,
		},
	});

	const previousLineItem = getRefundLineItemForPrice({
		ctx,
		customerProduct,
		billingContext,
		priceId: customerPrice.price.id,
		catalogFallback: catalogRefundLineItem,
	});

	const newLineItem = usagePriceToLineItem({
		cusEnt: billingContext.updatedCustomerEntitlement,
		context: lineItemContext,
		options: {
			shouldProrateOverride: shouldApplyProration,
			chargeImmediatelyOverride: chargeImmediately,
		},
	});

	const netAmount = Math.abs(
		sumValues([
			previousLineItem?.amountAfterDiscounts ?? 0,
			newLineItem?.amountAfterDiscounts ?? 0,
		]),
	);

	if (netAmount < BILLING_AMOUNT_EPSILON) return [];

	return [previousLineItem, newLineItem].filter(
		(li): li is LineItem => li !== undefined,
	);
};
