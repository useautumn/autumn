import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	InternalError,
	type LineItemContext,
	type StripeBillingPlan,
	sumValues,
	usagePriceToLineItems,
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

	// Pricing a balance of -chargeUnits bills exactly the units settled now, which the lines describe.
	const lineItems = usagePriceToLineItems({
		cusEnt: { ...customerEntitlement, balance: -chargeUnits },
		context: lineItemContext,
		options: { shouldProrateOverride: false, chargeImmediatelyOverride: true },
	});

	const settlementAmount = sumValues(
		lineItems.map((lineItem) => lineItem.amount),
	);
	if (settlementAmount <= 0) {
		throw new InternalError({
			message: `[computeThresholdBillingPlan] Settlement amount for feature ${feature.id} was ${settlementAmount}`,
		});
	}

	const { deltas } = computeRebalancedAutoTopUp({
		fullCustomer: billingContext.fullCustomer,
		featureId: feature.id,
		quantity: chargeUnits,
		prepaidCustomerEntitlementId: customerEntitlement.id,
		// The credit offsets usage this invoice bills, so month-end itemization still nets correctly.
		allowInvoiceCreditBalance: true,
	});

	return {
		autumnBillingPlan: {
			customerId: billingContext.fullCustomer?.id ?? "",
			insertCustomerProducts: [],
			lineItems,
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
					lines: lineItemsToInvoiceAddLinesParams({ lineItems }),
				},
			},
		},
	};
};
