import { BillingVersion, cusProductToProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillableFullCustomer } from "@/internal/balances/getBillableFullCustomer.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { resolveThresholdSettlement } from "../resolve/resolveThresholdSettlement.js";
import type { ThresholdBillingContext } from "../thresholdBillingContext.js";

export type SetupThresholdBillingResult =
	| { ok: true; billingContext: ThresholdBillingContext }
	| {
			ok: false;
			reason:
				| "customer_unavailable"
				| "not_threshold_billed"
				| "nothing_to_settle";
	  };

export const setupThresholdBillingContext = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<SetupThresholdBillingResult> => {
	const fullCustomer = await getBillableFullCustomer({
		ctx,
		customerId,
		source: "setupThresholdBillingContext",
	});

	if (!fullCustomer?.processor?.id) {
		return { ok: false, reason: "customer_unavailable" };
	}

	const settlement = resolveThresholdSettlement({ fullCustomer, featureId });
	if (settlement.kind !== "settle") {
		return { ok: false, reason: settlement.kind };
	}

	const { customerProduct, customerPrice } = settlement;

	const { stripeCus, paymentMethod, testClockFrozenTime } =
		await fetchStripeCustomerForBilling({ ctx, fullCus: fullCustomer });

	// Debt is already incurred, so an uncollectable charge still has to leave an
	// invoice behind rather than be skipped the way a prepaid grant would be.
	const invoiceMode = paymentMethod
		? undefined
		: { finalizeInvoice: true, enableProductImmediately: true };

	return {
		ok: true,
		billingContext: {
			fullCustomer,
			fullProducts: [cusProductToProduct({ cusProduct: customerProduct })],
			featureQuantities: [],
			invoiceMode,
			currentEpochMs: testClockFrozenTime ?? Date.now(),
			billingCycleAnchorMs: "now",
			resetCycleAnchorMs: "now",
			stripeCustomer: stripeCus,
			paymentMethod,
			billingVersion: BillingVersion.V2,
			actionSource: "threshold_billing",
			// Names the product this invoice settles, so paying it unblocks only
			// that product and not every threshold plan the customer holds.
			actionCustomerProductId: customerProduct.id,
			customerEntitlement: settlement.customerEntitlement,
			customerProduct,
			customerPrice,
			chargeUnits: settlement.charge.chargeUnits,
		},
	};
};
