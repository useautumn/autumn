import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	InternalError,
	type LineItemContext,
	type StripeBillingPlan,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams.js";
import type { ThresholdBillingContext } from "../thresholdBillingContext.js";

export const computeThresholdBillingPlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: ThresholdBillingContext;
}): {
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
} => {
	const { customerEntitlement, customerProduct, customerPrice, chargeUnits } =
		billingContext;
	const feature = customerEntitlement.entitlement.feature;

	const lineItemContext = {
		price: customerPrice.price,
		product: customerProduct.product,
		feature,
		currency: billingContextToCurrency({
			org: ctx.org,
			billingContext: billingContext,
		}),
		direction: "charge",
		now: Date.now(),
		billingTiming: "in_advance",
	} satisfies LineItemContext;

	const lineItem = usagePriceToLineItem({
		cusEnt: { ...customerEntitlement, balance: -chargeUnits },
		context: lineItemContext,
		options: { shouldProrateOverride: false, chargeImmediatelyOverride: true },
	});

	if (lineItem.amount <= 0) {
		throw new InternalError({
			message: `[computeThresholdBillingPlan] Settlement amount for feature ${feature.id} was ${lineItem.amount}`,
		});
	}

	const { deltas } = computeRebalancedAutoTopUp({
		fullCustomer: billingContext.fullCustomer,
		featureId: feature.id,
		quantity: chargeUnits,
		prepaidCustomerEntitlementId: customerEntitlement.id,
	});

	return {
		autumnBillingPlan: {
			customerId: billingContext.fullCustomer?.id ?? "",
			insertCustomerProducts: [],
			lineItems: [lineItem],
			updateCustomerEntitlements: [],
			autoTopupRebalance: {
				deltas,
				customerEntitlementId: customerEntitlement.id,
				featureId: feature.id,
				quantity: chargeUnits,
				creditedCustomerEntitlementId: customerEntitlement.id,
			},
		},
		stripeBillingPlan: {
			invoiceAction: {
				addLineParams: {
					lines: lineItemsToInvoiceAddLinesParams({ lineItems: [lineItem] }),
				},
			},
		},
	};
};
