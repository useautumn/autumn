import {
	cusEntToCusPrice,
	InternalError,
	type LineItemContext,
	orgToCurrency,
	priceToProrationConfig,
	sumValues,
	usagePriceToLineItem,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getLineItemBillingPeriod } from "@/internal/billing/v2/utils/lineItems/getLineItemBillingPeriod";
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

	const previousLIneItem = usagePriceToLineItem({
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

	const newLineItem = usagePriceToLineItem({
		cusEnt: billingContext.updatedCutomerEntitlement,
		context: lineItemContext,
		options: {
			shouldProrateOverride: shouldApplyProration,
			chargeImmediatelyOverride: chargeImmediately,
		},
	});

	// Don't return line items if they sum to 0
	if (
		sumValues([
			previousLIneItem?.amountAfterDiscounts ?? 0,
			newLineItem?.amountAfterDiscounts ?? 0,
		]) === 0
	) {
		return [];
	}

	return [previousLIneItem, newLineItem];
};
