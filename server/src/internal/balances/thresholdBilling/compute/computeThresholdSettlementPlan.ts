import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	cusEntToCusPrice,
	InternalError,
	type LineItemContext,
	type StripeBillingPlan,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams.js";
import type { ThresholdSettlementContext } from "../thresholdSettlementContext.js";

export const computeThresholdSettlementPlan = ({
	ctx,
	settlementContext,
}: {
	ctx: AutumnContext;
	settlementContext: ThresholdSettlementContext;
}): {
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
} => {
	const { customerEntitlement, charge } = settlementContext;
	const customerProduct = customerEntitlement.customer_product!;
	const feature = customerEntitlement.entitlement.feature;
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement })!;

	const lineItemContext = {
		price: customerPrice.price,
		product: customerProduct.product,
		feature,
		currency: billingContextToCurrency({
			org: ctx.org,
			billingContext: settlementContext,
		}),
		direction: "charge",
		now: Date.now(),
		billingTiming: "in_advance",
	} satisfies LineItemContext;

	const lineItem = usagePriceToLineItem({
		cusEnt: { ...customerEntitlement, balance: -charge.chargeUnits },
		context: lineItemContext,
		options: { shouldProrateOverride: false, chargeImmediatelyOverride: true },
	});

	if (lineItem.amount <= 0) {
		throw new InternalError({
			message: `[computeThresholdSettlementPlan] Settlement amount for feature ${feature.id} was ${lineItem.amount}`,
		});
	}

	const { deltas } = computeRebalancedAutoTopUp({
		fullCustomer: settlementContext.fullCustomer,
		featureId: feature.id,
		quantity: charge.chargeUnits,
		prepaidCustomerEntitlementId: customerEntitlement.id,
	});

	return {
		autumnBillingPlan: {
			customerId: settlementContext.fullCustomer?.id ?? "",
			insertCustomerProducts: [],
			lineItems: [lineItem],
			updateCustomerEntitlements: [],
			autoTopupRebalance: { deltas },
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
